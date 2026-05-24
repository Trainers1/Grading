-- 트레이너스 그레이딩 대행 서비스 DB 전면 재설계 (002)
--
-- 변경 요약 (vs 001):
--   * cards: english_name 추가, set_name/card_number/year/back_image_url NULL 허용
--   * orders: service_price_snapshot, shipping_fee, cancelled_at, cancel_reason 추가
--             pickup_method=DELIVERY 시 delivery_address 강제 CHECK
--             order_status를 8단계로 축소 (총판 발송 후 ~ 등급 확정 전 중간 상태 제거)
--   * profiles: marketing_enabled 추가
--   * grading_services: code UNIQUE(company,code) 추가
--   * batches: company 추가, status에 RECEIVED 포함, received_at/completed_at/note 추가
--   * payments: toss_order_id, idempotency_key, raw_response, failure_reason, paid_at 추가
--   * order_status_logs: changed_by → admin_users(id) FK
--   * order_receipt_photos (신규): 관리자 수령 시 다중 사진 업로드
--   * consent_logs (신규): 약관 동의 이력 (개인정보보호법)
--   * RLS: 전 테이블 활성, is_admin() 헬퍼 도입
--   * 트리거: log_order_status_change, enforce_order_user_update_columns 추가
--
-- 본 redesign에서 제외된 항목:
--   * 알림 발송 이력 테이블 (notifications) — 추후 별도 마이그레이션
--   * 그레이딩 진행 중 세부 추적 — 총판 발송 후 ~ 등급 확정까지는
--     운영자가 추적하지 않으므로 단일 상태(DISTRIBUTOR_SHIPPED)로 표현
--
-- 전제: 운영 데이터가 없는 환경에서 001 → 002 reset 적용.

BEGIN;

-- =====================================================================
-- 1. 기존 객체 제거
-- =====================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- notifications 테이블은 본 redesign에 포함되지 않음 (이전 시도에서 생성되었을 수 있어 함께 정리)
DROP TABLE IF EXISTS
  consent_logs,
  notifications,
  batch_orders,
  batches,
  payments,
  order_status_logs,
  order_receipt_photos,
  cards,
  orders,
  grading_services,
  admin_users,
  profiles
CASCADE;

-- =====================================================================
-- 2. 공통 함수
-- =====================================================================

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- auth.users INSERT 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, phone, provider)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'provider', 'email')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- is_admin() 헬퍼는 admin_users 테이블 생성 이후에 정의 (Section 3 끝)

-- =====================================================================
-- 3. 사용자 / 관리자
-- =====================================================================

CREATE TABLE profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  name                  TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  provider              TEXT NOT NULL DEFAULT 'email'
                        CHECK (provider IN ('email', 'kakao', 'naver')),
  phone_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked            BOOLEAN NOT NULL DEFAULT FALSE,
  block_reason          TEXT,
  notification_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL
              CHECK (role IN ('SUPER_ADMIN', 'STORE_MANAGER', 'GRADING_MANAGER', 'CS_AGENT')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 현재 사용자가 활성 관리자인지 판정 (RLS 헬퍼)
-- auth.users.email → admin_users.email 매핑.
-- temp-auth 단계에서는 이 함수가 false를 반환할 수 있으므로
-- 관리자 작업은 service_role 키로 수행하는 것을 가정.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_users a
    JOIN auth.users u ON u.email = a.email
    WHERE u.id = auth.uid()
      AND a.is_active = TRUE
  );
$$;

-- =====================================================================
-- 4. 등급 서비스 카탈로그
-- =====================================================================

CREATE TABLE grading_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company         TEXT NOT NULL CHECK (company IN ('PSA', 'BGS', 'CGC', 'BRG')),
  code            TEXT NOT NULL,                     -- e.g. 'psa_economy'
  name            TEXT NOT NULL,
  price           INTEGER NOT NULL CHECK (price >= 0),
  estimated_days  TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company, code)
);

CREATE INDEX idx_grading_services_company_active
  ON grading_services(company, is_active);

-- =====================================================================
-- 5. 주문 / 카드
-- =====================================================================

CREATE TABLE orders (
  id                          TEXT PRIMARY KEY,                  -- YYYYMMDD-순번
  user_id                     UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  name                        TEXT NOT NULL,
  phone                       TEXT NOT NULL,
  pickup_method               TEXT NOT NULL CHECK (pickup_method IN ('STORE_PICKUP', 'DELIVERY')),
  delivery_address            TEXT,
  grading_company             TEXT NOT NULL CHECK (grading_company IN ('PSA', 'BGS', 'CGC', 'BRG')),
  service_level               TEXT NOT NULL,                     -- grading_services.code 참조 (가격 변경 보호 위해 FK 미사용)
  service_price_snapshot      INTEGER NOT NULL CHECK (service_price_snapshot >= 0),
  payment_status              TEXT NOT NULL DEFAULT 'PENDING'
                              CHECK (payment_status IN (
                                'PENDING', 'PAID',
                                'OVERCHARGE_PENDING', 'OVERCHARGE_PAID',
                                'REFUNDED', 'FAILED'
                              )),
  prepaid_amount              INTEGER NOT NULL DEFAULT 0,
  overcharge_amount           INTEGER,
  shipping_fee                INTEGER NOT NULL DEFAULT 0,
  -- 8단계: 총판 발송 이후 ~ 등급 확정 전 중간 상태(그레이딩사 접수/진행/반송 등)는 추적하지 않음.
  -- DISTRIBUTOR_SHIPPED 단일 상태가 "총판 발송 ~ 등급 확정 전"을 모두 포함.
  order_status                TEXT NOT NULL DEFAULT 'PAYMENT_PENDING'
                              CHECK (order_status IN (
                                'PAYMENT_PENDING',
                                'CARD_DELIVERY_PENDING',
                                'CARD_RECEIVED',
                                'DISTRIBUTOR_SHIPPED',
                                'GRADE_CONFIRMED',
                                'TRAINERS_ARRIVED',
                                'READY_FOR_PICKUP',
                                'COMPLETED'
                              )),
  spoiler_preference          TEXT NOT NULL DEFAULT 'ALLOW'
                              CHECK (spoiler_preference IN ('ALLOW', 'DENY')),
  customer_memo               TEXT,
  internal_memo               TEXT,
  received_at                 TIMESTAMPTZ,
  distributor_shipped_at      TIMESTAMPTZ,
  distributor_tracking_number TEXT,
  user_tracking_number        TEXT,
  cancelled_at                TIMESTAMPTZ,
  cancel_reason               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (pickup_method <> 'DELIVERY' OR delivery_address IS NOT NULL)
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(order_status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX idx_orders_company_status ON orders(grading_company, order_status);

CREATE TABLE cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  card_name           TEXT NOT NULL,
  english_name        TEXT,
  set_name            TEXT,
  card_number         TEXT,
  year                TEXT,
  declared_value      INTEGER,
  front_image_url     TEXT NOT NULL,
  back_image_url      TEXT,
  condition_photo_url TEXT,
  grade_result        TEXT,
  slab_photo_url      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cards_order_id ON cards(order_id);

CREATE TABLE order_receipt_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  photo_url   TEXT NOT NULL,
  caption     TEXT,
  uploaded_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_receipt_photos_order_id ON order_receipt_photos(order_id);

CREATE TABLE order_status_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status      TEXT NOT NULL,
  changed_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  change_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_logs_order_id_created
  ON order_status_logs(order_id, created_at DESC);

-- =====================================================================
-- 6. 결제
-- =====================================================================

CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_type        TEXT NOT NULL
                      CHECK (payment_type IN ('PREPAYMENT', 'OVERCHARGE', 'REFUND', 'SHIPPING')),
  amount              INTEGER NOT NULL,
  payment_method      TEXT,
  toss_order_id       TEXT,                          -- 가맹점 주문번호
  toss_payment_key    TEXT,                          -- 토스가 발급
  idempotency_key     TEXT UNIQUE,                   -- 클라이언트 발급
  status              TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  raw_response        JSONB,                         -- Toss 응답 원본
  failure_reason      TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE UNIQUE INDEX idx_payments_toss_payment_key
  ON payments(toss_payment_key) WHERE toss_payment_key IS NOT NULL;
CREATE INDEX idx_payments_status ON payments(status);

-- =====================================================================
-- 7. 배치 (월별/회사별 발송)
-- =====================================================================

CREATE TABLE batches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company         TEXT NOT NULL CHECK (company IN ('PSA', 'BGS', 'CGC', 'BRG')),
  batch_month     TEXT NOT NULL,                                -- 'YYYY-MM'
  status          TEXT NOT NULL DEFAULT 'PREPARING'
                  CHECK (status IN ('PREPARING', 'SHIPPED', 'RECEIVED', 'COMPLETED')),
  submitted_at    TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  received_at     TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  tracking_number TEXT,
  receipt_url     TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company, batch_month)
);

CREATE INDEX idx_batches_status ON batches(status);

CREATE TABLE batch_orders (
  batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  order_id    TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (batch_id, order_id)
);

CREATE INDEX idx_batch_orders_order_id ON batch_orders(order_id);

-- =====================================================================
-- 8. 약관 동의 이력 (append-only legal trail)
-- =====================================================================

CREATE TABLE consent_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL
                  CHECK (consent_type IN ('TERMS', 'PRIVACY', 'PRIVACY_THIRD_PARTY', 'MARKETING')),
  version         TEXT NOT NULL,
  agreed          BOOLEAN NOT NULL,
  ip_address      INET,
  user_agent      TEXT,
  context         TEXT,                                  -- 'SIGNUP' | 'APPLY' | 'PROFILE_UPDATE'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consent_logs_user_type_created
  ON consent_logs(user_id, consent_type, created_at DESC);

-- =====================================================================
-- 9. updated_at 트리거 부착
-- =====================================================================

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_admin_users_updated_at
  BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_grading_services_updated_at
  BEFORE UPDATE ON grading_services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_cards_updated_at
  BEFORE UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_batches_updated_at
  BEFORE UPDATE ON batches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================================
-- 10. 주문 상태 변경 자동 로깅
-- =====================================================================

CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    SELECT a.id INTO v_admin_id
    FROM admin_users a
    JOIN auth.users u ON u.email = a.email
    WHERE u.id = auth.uid()
    LIMIT 1;

    INSERT INTO order_status_logs (order_id, previous_status, new_status, changed_by)
    VALUES (NEW.id, OLD.order_status, NEW.order_status, v_admin_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_orders_status_change
  AFTER UPDATE OF order_status ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- =====================================================================
-- 11. 일반 사용자가 orders UPDATE 가능 컬럼 화이트리스트
--     (RLS WITH CHECK 만으로는 컬럼 단위 제약 표현이 어려움)
-- =====================================================================

CREATE OR REPLACE FUNCTION enforce_order_user_update_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- 관리자 또는 service_role 호출은 무제한 허용
  IF is_admin() OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 일반 사용자는 다음 컬럼만 변경 가능
  IF (NEW.user_id              IS DISTINCT FROM OLD.user_id)
     OR (NEW.id                IS DISTINCT FROM OLD.id)
     OR (NEW.name              IS DISTINCT FROM OLD.name)
     OR (NEW.phone             IS DISTINCT FROM OLD.phone)
     OR (NEW.grading_company   IS DISTINCT FROM OLD.grading_company)
     OR (NEW.service_level     IS DISTINCT FROM OLD.service_level)
     OR (NEW.service_price_snapshot IS DISTINCT FROM OLD.service_price_snapshot)
     OR (NEW.payment_status    IS DISTINCT FROM OLD.payment_status)
     OR (NEW.prepaid_amount    IS DISTINCT FROM OLD.prepaid_amount)
     OR (NEW.overcharge_amount IS DISTINCT FROM OLD.overcharge_amount)
     OR (NEW.shipping_fee      IS DISTINCT FROM OLD.shipping_fee)
     OR (NEW.order_status      IS DISTINCT FROM OLD.order_status)
     OR (NEW.received_at       IS DISTINCT FROM OLD.received_at)
     OR (NEW.distributor_shipped_at IS DISTINCT FROM OLD.distributor_shipped_at)
     OR (NEW.distributor_tracking_number IS DISTINCT FROM OLD.distributor_tracking_number)
     OR (NEW.internal_memo     IS DISTINCT FROM OLD.internal_memo)
  THEN
    RAISE EXCEPTION 'permission denied: user may only update pickup_method, delivery_address, spoiler_preference, customer_memo, user_tracking_number, cancelled_at, cancel_reason';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_orders_user_columns
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION enforce_order_user_update_columns();

-- =====================================================================
-- 12. RLS 활성화
-- =====================================================================

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_receipt_photos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_logs          ENABLE ROW LEVEL SECURITY;

-- ---------- profiles ----------
CREATE POLICY profiles_select_own_or_admin ON profiles
  FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY profiles_update_own_or_admin ON profiles
  FOR UPDATE USING (auth.uid() = id OR is_admin())
  WITH CHECK (auth.uid() = id OR is_admin());
CREATE POLICY profiles_admin_delete ON profiles
  FOR DELETE USING (is_admin());

-- ---------- admin_users ----------
CREATE POLICY admin_users_admin_all ON admin_users
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------- grading_services ----------
CREATE POLICY grading_services_select_anyone ON grading_services
  FOR SELECT USING (TRUE);
CREATE POLICY grading_services_admin_write ON grading_services
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY grading_services_admin_update ON grading_services
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY grading_services_admin_delete ON grading_services
  FOR DELETE USING (is_admin());

-- ---------- orders ----------
CREATE POLICY orders_select_own_or_admin ON orders
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY orders_insert_self ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY orders_update_own_or_admin ON orders
  FOR UPDATE USING (auth.uid() = user_id OR is_admin())
  WITH CHECK (auth.uid() = user_id OR is_admin());
CREATE POLICY orders_admin_delete ON orders
  FOR DELETE USING (is_admin());

-- ---------- cards ----------
CREATE POLICY cards_select_owner_or_admin ON cards
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM orders o WHERE o.id = cards.order_id AND o.user_id = auth.uid()
    )
  );
CREATE POLICY cards_insert_owner_or_admin ON cards
  FOR INSERT WITH CHECK (
    is_admin() OR EXISTS (
      SELECT 1 FROM orders o WHERE o.id = cards.order_id AND o.user_id = auth.uid()
    )
  );
CREATE POLICY cards_admin_update ON cards
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY cards_admin_delete ON cards
  FOR DELETE USING (is_admin());

-- ---------- order_receipt_photos ----------
CREATE POLICY orp_select_owner_or_admin ON order_receipt_photos
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM orders o WHERE o.id = order_receipt_photos.order_id AND o.user_id = auth.uid()
    )
  );
CREATE POLICY orp_admin_write ON order_receipt_photos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------- order_status_logs ----------
CREATE POLICY osl_select_owner_or_admin ON order_status_logs
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM orders o WHERE o.id = order_status_logs.order_id AND o.user_id = auth.uid()
    )
  );
-- INSERT는 트리거(SECURITY DEFINER)로 수행됨 — anon/유저 직접 INSERT 차단
-- UPDATE/DELETE: 정책 없음 → 차단

-- ---------- payments ----------
CREATE POLICY payments_select_owner_or_admin ON payments
  FOR SELECT USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM orders o WHERE o.id = payments.order_id AND o.user_id = auth.uid()
    )
  );
CREATE POLICY payments_admin_write ON payments
  FOR INSERT WITH CHECK (is_admin());
CREATE POLICY payments_admin_update ON payments
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
-- DELETE 정책 없음 → 차단 (감사 보존)

-- ---------- batches / batch_orders ----------
CREATE POLICY batches_admin_all ON batches
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY batch_orders_admin_all ON batch_orders
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------- consent_logs ----------
CREATE POLICY consent_logs_select_own_or_admin ON consent_logs
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY consent_logs_insert_self_or_admin ON consent_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR is_admin());
-- UPDATE/DELETE 정책 없음 → append-only

COMMIT;
