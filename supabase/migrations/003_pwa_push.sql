-- 트레이너스 그레이딩 대행 서비스 — PWA Web Push 기반 테이블 (003)
--
-- 변경 요약:
--   * push_subscriptions (신규): 고객 푸시 구독 엔드포인트 저장
--   * notifications_outbox (신규): 발송 outbox — 멱등성 보장 + 재시도 추적
--   * RLS: 전 테이블 활성, service_role 묵시적 ALL, anon/authenticated DENY
--   * admin SELECT 정책: notifications_outbox → is_admin() SUPER_ADMIN/GRADING_MANAGER
--   * pg_cron 폴백 SQL 주석 동봉 (Vercel Cron 미사용 시 주석 해제)
--
-- 전제: 002_redesign.sql 적용 완료 환경 (orders, order_status_logs 테이블 존재).
-- F-PUSH-1: Supabase Auth 마이그 완료 후 user_id NOT NULL flip + RLS auth.uid() 정책 추가.

BEGIN;

-- ============================================================================
-- 1. 푸시 구독 테이블
-- ============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- temp-auth 단계: 이메일로 구독 소유자 식별 (F-PUSH-1 후 user_id NOT NULL flip)
  subscriber_email TEXT        NOT NULL,
  -- nullable until F-PUSH-1 (Supabase Auth 마이그 후 채움)
  user_id          UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint         TEXT        NOT NULL UNIQUE,
  p256dh           TEXT        NOT NULL,
  auth_key         TEXT        NOT NULL,
  user_agent       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL = 활성, non-NULL = 만료 (410 Gone 응답 또는 사용자 해지)
  expired_at       TIMESTAMPTZ
);

-- 활성 구독만 조회하는 인덱스 (dispatcher JOIN 경로)
CREATE INDEX IF NOT EXISTS idx_push_subs_email_active
  ON push_subscriptions(subscriber_email)
  WHERE expired_at IS NULL;

-- ============================================================================
-- 2. 알림 발송 outbox 테이블
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications_outbox (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            TEXT        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- order_status_logs row FK — dispatcher가 이 행을 통해 customer email JOIN
  -- (order_status_logs.changed_by → admin_users(id) 이므로 customer는 outbox → status_logs → orders → profiles 경로)
  order_status_log_id UUID        NOT NULL REFERENCES order_status_logs(id) ON DELETE CASCADE,
  status_key          TEXT        NOT NULL,
  -- channel 컬럼: 후속 알림톡 등 multi-channel 자연 확장용
  channel             TEXT        NOT NULL DEFAULT 'web_push',
  dispatched_at       TIMESTAMPTZ,
  attempt_count       INT         NOT NULL DEFAULT 0,
  last_error          TEXT,
  -- spoiler skip 등 발송 제외 사유 (현재 v1.0에서는 구독 0건·VAPID 누락 등에 사용)
  skipped_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 멱등성 보장: 동일 (order, status, channel) 조합 중복 INSERT 차단
  CONSTRAINT notifications_outbox_unique UNIQUE (order_id, status_key, channel)
);

-- 미발송 대기 행 스캔 인덱스 (dispatcher WHERE 절 정합)
CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON notifications_outbox(created_at)
  WHERE dispatched_at IS NULL AND skipped_reason IS NULL;

-- order_status_log_id 역참조 인덱스
CREATE INDEX IF NOT EXISTS idx_outbox_log
  ON notifications_outbox(order_status_log_id);

-- ============================================================================
-- 3. RLS 활성화
-- ============================================================================

ALTER TABLE push_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_outbox ENABLE ROW LEVEL SECURITY;

-- service_role은 묵시적으로 모든 작업 허용.
-- anon / authenticated 역할: 정책 없음 → 기본 DENY.
-- F-PUSH-1 완료 후 아래 정책 추가 예정:
--   CREATE POLICY push_subs_select_own ON push_subscriptions
--     FOR SELECT USING (auth.uid() = user_id);
--   CREATE POLICY push_subs_insert_own ON push_subscriptions
--     FOR INSERT WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY push_subs_delete_own ON push_subscriptions
--     FOR DELETE USING (auth.uid() = user_id);

-- ---------- notifications_outbox admin SELECT ----------
-- 관리자 observability 페이지 (B6) 에서 조회 허용.
-- application-layer에서 SUPER_ADMIN/GRADING_MANAGER 역할 추가 검증 (ADR-005).
CREATE POLICY outbox_admin_select ON notifications_outbox
  FOR SELECT USING (is_admin());

-- ============================================================================
-- 4. pg_cron 폴백 (Vercel Cron 사용 불가 시 주석 해제)
-- ============================================================================
--
-- !! Bootstrap (최초 1회, 마이그레이션 외부에서 실행):
-- !!   ALTER DATABASE postgres SET app.cron_secret = '<secret>';
-- !!   -- 또는 Supabase Dashboard → Project Settings → Secrets:
-- !!   --   supabase secrets set CRON_SECRET=<secret>
-- !!
-- !! 활성화 전 확인:
-- !!   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- !!   SELECT * FROM pg_extension WHERE extname = 'pg_net';
--
-- SELECT cron.schedule(
--   'push_dispatch_5min',
--   '*/5 * * * *',
--   $$
--     SELECT net.http_get(
--       url     := 'https://<host>/api/push/dispatch',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || current_setting('app.cron_secret')
--       )
--     );
--   $$
-- );

-- ============================================================================
-- 5. outbox attempt_count 증가 헬퍼 함수 (dispatcher RPC 호출용)
-- ============================================================================
-- dispatcher.ts의 incrementAttempt()가 호출하는 서버-사이드 함수.
-- SECURITY DEFINER: service_role만 호출 가능 (RLS bypass 포함).

CREATE OR REPLACE FUNCTION fn_increment_outbox_attempt(
  p_row_id UUID,
  p_error  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE notifications_outbox
  SET
    attempt_count = attempt_count + 1,
    last_error    = p_error
  WHERE id = p_row_id;
END;
$$;

-- ============================================================================
-- 6. order_status_logs AFTER INSERT 트리거 — milestone outbox 자동 enqueue (B5)
-- ============================================================================
-- 설계: status_log INSERT와 outbox INSERT를 동일 트랜잭션으로 묶어 원자성 보장
--       (Architect patch #2).
--
-- milestone 5개 (src/constants/notifications.ts MILESTONE_STATUS_KEYS와 동기화 유지):
--   CARD_DELIVERY_PENDING / DISTRIBUTOR_SHIPPED / GRADE_CONFIRMED
--   / READY_FOR_PICKUP / COMPLETED
--
-- !! sync drift 방지: MILESTONE_STATUS_KEYS 변경 시 이 함수도 동시에 수정할 것.

CREATE OR REPLACE FUNCTION fn_enqueue_milestone_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- milestone 키 배열 (src/constants/notifications.ts MILESTONE_STATUS_KEYS와 일치)
  v_milestones TEXT[] := ARRAY[
    'CARD_DELIVERY_PENDING',
    'DISTRIBUTOR_SHIPPED',
    'GRADE_CONFIRMED',
    'READY_FOR_PICKUP',
    'COMPLETED'
  ];
BEGIN
  -- new_status가 milestone 집합에 속할 때만 outbox INSERT
  IF NEW.new_status = ANY(v_milestones) THEN
    INSERT INTO notifications_outbox (
      order_id,
      order_status_log_id,
      status_key,
      channel
    )
    VALUES (
      NEW.order_id,
      NEW.id,
      NEW.new_status,
      'web_push'
    )
    ON CONFLICT ON CONSTRAINT notifications_outbox_unique DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 트리거 등록 (IF NOT EXISTS는 트리거에 지원 안 되므로 DROP IF EXISTS 후 생성)
DROP TRIGGER IF EXISTS trg_enqueue_milestone_dispatch ON order_status_logs;

CREATE TRIGGER trg_enqueue_milestone_dispatch
  AFTER INSERT ON order_status_logs
  FOR EACH ROW
  EXECUTE FUNCTION fn_enqueue_milestone_dispatch();

COMMIT;
