-- 트레이너스 그레이딩 대행 서비스 DB 스키마

-- 유저 프로필 (Supabase Auth와 연동)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  provider TEXT DEFAULT 'email', -- email, kakao, naver
  phone_verified BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  notification_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 어드민 유저
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'STORE_MANAGER', 'GRADING_MANAGER', 'CS_AGENT')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 등급회사 서비스 (동적 관리)
CREATE TABLE IF NOT EXISTS grading_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL CHECK (company IN ('PSA', 'BGS', 'CGC', 'BRG')),
  name TEXT NOT NULL, -- 서비스명 (PSA Regular 등)
  price INTEGER NOT NULL, -- 가격 (원)
  estimated_days TEXT NOT NULL, -- 예상 소요기간
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 주문 (Order)
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, -- YYYYMMDD-순번
  user_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pickup_method TEXT NOT NULL CHECK (pickup_method IN ('STORE_PICKUP', 'DELIVERY')),
  delivery_address TEXT,
  grading_company TEXT NOT NULL CHECK (grading_company IN ('PSA', 'BGS', 'CGC', 'BRG')),
  service_level TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'PAID', 'OVERCHARGE_PENDING', 'OVERCHARGE_PAID', 'REFUNDED', 'FAILED')),
  prepaid_amount INTEGER NOT NULL DEFAULT 0,
  overcharge_amount INTEGER,
  order_status TEXT NOT NULL DEFAULT 'PAYMENT_PENDING'
    CHECK (order_status IN (
      'PAYMENT_PENDING', 'CARD_DELIVERY_PENDING', 'CARD_RECEIVED',
      'DISTRIBUTOR_SHIPPED', 'DISTRIBUTOR_RECEIVED',
      'GRADING_COMPANY_SHIPPED', 'GRADING_COMPANY_RECEIVED',
      'GRADING_IN_PROGRESS', 'GRADE_CONFIRMED',
      'GRADING_COMPANY_RETURNED', 'DISTRIBUTOR_ARRIVED',
      'TRAINERS_ARRIVED', 'READY_FOR_PICKUP', 'COMPLETED'
    )),
  spoiler_preference TEXT NOT NULL DEFAULT 'ALLOW'
    CHECK (spoiler_preference IN ('ALLOW', 'DENY')),
  received_at TIMESTAMPTZ,
  distributor_shipped_at TIMESTAMPTZ,
  distributor_tracking_number TEXT,
  user_tracking_number TEXT,
  customer_memo TEXT,
  internal_memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 카드 (Card) - 주문 1건에 N개 카드
CREATE TABLE IF NOT EXISTS cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  card_name TEXT NOT NULL,
  set_name TEXT NOT NULL,
  card_number TEXT NOT NULL,
  year TEXT NOT NULL,
  declared_value INTEGER,
  front_image_url TEXT NOT NULL,
  back_image_url TEXT NOT NULL,
  condition_photo_url TEXT,
  grade_result TEXT,
  slab_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 주문 상태 변경 이력 (작업 로그)
CREATE TABLE IF NOT EXISTS order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID, -- 어드민 ID 또는 시스템
  change_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 결제 내역
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL REFERENCES orders(id),
  payment_type TEXT NOT NULL CHECK (payment_type IN ('PREPAYMENT', 'OVERCHARGE', 'REFUND', 'SHIPPING')),
  amount INTEGER NOT NULL,
  payment_method TEXT, -- card, transfer, etc.
  toss_payment_key TEXT, -- 토스페이먼츠 결제 키
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 배치 발송
CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_month TEXT NOT NULL, -- YYYY-MM
  submitted_at TIMESTAMPTZ, -- 카드하비 접수일
  shipped_at TIMESTAMPTZ, -- 발송일
  tracking_number TEXT, -- 운송장 번호
  receipt_url TEXT, -- 영수증 URL
  status TEXT NOT NULL DEFAULT 'PREPARING'
    CHECK (status IN ('PREPARING', 'SHIPPED', 'COMPLETED')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 배치-주문 연결
CREATE TABLE IF NOT EXISTS batch_orders (
  batch_id UUID NOT NULL REFERENCES batches(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  PRIMARY KEY (batch_id, order_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_order_id ON cards(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order_id ON order_status_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_cards_updated_at
  BEFORE UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 프로필 자동 생성 (회원가입 시)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
