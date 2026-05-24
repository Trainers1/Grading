-- 006: 출고(SHIPPED_OUT) 단계 추가 + 결제 완료 시 자동 상태 전이
--
-- 변경 요약
--   1) orders.order_status CHECK 에 'SHIPPED_OUT' 추가 (CARD_RECEIVED ↔ DISTRIBUTOR_SHIPPED 사이)
--   2) orders.shipped_out_at TIMESTAMPTZ 추가 (출고 시각 — 전이 자동 카운트 시작점)
--   3) grading_services.transit_days INTEGER 추가 (서비스별 출고→그레이딩 진행 자동 전이 기간)
--   4) BEFORE UPDATE 트리거: payment_status PAID 로 전이 + order_status='PAYMENT_PENDING' 일 때
--      자동으로 order_status='CARD_DELIVERY_PENDING' 설정
--   5) BEFORE UPDATE 트리거: order_status='SHIPPED_OUT' 으로 전이 시 shipped_out_at 자동 기록
--   6) 함수 promote_shipped_to_in_grading(): cron 호출용 — 출고 후 transit_days 경과 주문을
--      'DISTRIBUTOR_SHIPPED' 로 일괄 전이 (status_log + push outbox 는 기존 트리거가 처리)
--   7) fn_enqueue_milestone_dispatch milestone 배열에 SHIPPED_OUT 포함 (출고 시 푸시 알림)
--
-- 전제: 002_redesign.sql, 003_pwa_push.sql 적용 완료.

BEGIN;

-- =====================================================================
-- 1. orders.order_status CHECK 갱신
-- =====================================================================

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN (
    'PAYMENT_PENDING',
    'CARD_DELIVERY_PENDING',
    'CARD_RECEIVED',
    'SHIPPED_OUT',
    'DISTRIBUTOR_SHIPPED',
    'GRADE_CONFIRMED',
    'TRAINERS_ARRIVED',
    'READY_FOR_PICKUP',
    'COMPLETED'
  ));

-- =====================================================================
-- 2. orders.shipped_out_at 컬럼 추가
-- =====================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipped_out_at TIMESTAMPTZ;

-- =====================================================================
-- 3. grading_services.transit_days 컬럼 추가
-- =====================================================================
-- 기본 14일. 실제 서비스별 값은 추후 정확한 일정으로 갱신할 것 (docs/TODOS.md 참조).

ALTER TABLE grading_services
  ADD COLUMN IF NOT EXISTS transit_days INTEGER NOT NULL DEFAULT 14
  CHECK (transit_days >= 0);

-- 임시 시드 값 (운영 데이터 보정용 — 실 운영 값으로 추후 교체).
-- 동일 값으로 모두 14일을 유지하되, 코드 패턴별 임시 차등 부여.
UPDATE grading_services SET transit_days = CASE
  WHEN code LIKE '%super_express%' THEN 3
  WHEN code LIKE '%express%'       THEN 5
  WHEN code LIKE '%premium%'       THEN 5
  WHEN code LIKE '%standard%'      THEN 14
  WHEN code LIKE '%regular%'       THEN 14
  WHEN code LIKE '%economy%'       THEN 21
  ELSE 14
END
WHERE TRUE;

-- =====================================================================
-- 4. 결제 완료 시 자동 단계 전이 트리거
-- =====================================================================
-- payment_status 가 'PAID' 로 새로 전이되고 order_status 가 'PAYMENT_PENDING' 이라면
-- 자동으로 'CARD_DELIVERY_PENDING' 으로 승격.
-- BEFORE UPDATE 라 단일 트랜잭션 안에서 order_status 갱신이 반영되며,
-- 이로 인해 기존 log_order_status_change 트리거가 status log row 를 생성하고
-- fn_enqueue_milestone_dispatch 가 milestone 푸시를 enqueue 한다.

CREATE OR REPLACE FUNCTION fn_auto_promote_on_payment_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payment_status = 'PAID'
     AND OLD.payment_status IS DISTINCT FROM 'PAID'
     AND NEW.order_status = 'PAYMENT_PENDING'
  THEN
    NEW.order_status := 'CARD_DELIVERY_PENDING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_on_payment_paid ON orders;

CREATE TRIGGER trg_auto_promote_on_payment_paid
  BEFORE UPDATE OF payment_status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_promote_on_payment_paid();

-- =====================================================================
-- 5. SHIPPED_OUT 전이 시 shipped_out_at 자동 기록 트리거
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_stamp_shipped_out_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.order_status = 'SHIPPED_OUT'
     AND OLD.order_status IS DISTINCT FROM 'SHIPPED_OUT'
     AND NEW.shipped_out_at IS NULL
  THEN
    NEW.shipped_out_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_shipped_out_at ON orders;

CREATE TRIGGER trg_stamp_shipped_out_at
  BEFORE UPDATE OF order_status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_stamp_shipped_out_at();

-- =====================================================================
-- 6. 자동 승격 함수: SHIPPED_OUT → DISTRIBUTOR_SHIPPED
-- =====================================================================
-- 호출자: Vercel Cron → /api/orders/auto-promote (service-role)
-- 동작: shipped_out_at + grading_services.transit_days 가 NOW() 이전인
--       SHIPPED_OUT 주문을 DISTRIBUTOR_SHIPPED 로 일괄 UPDATE.
--       distributor_shipped_at 도 NOW() 로 갱신.
-- 반환: 처리된 주문 수.

CREATE OR REPLACE FUNCTION promote_shipped_to_in_grading()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH eligible AS (
    SELECT o.id
    FROM orders o
    JOIN grading_services gs
      ON gs.company = o.grading_company
     AND gs.code    = o.service_level
    WHERE o.order_status = 'SHIPPED_OUT'
      AND o.shipped_out_at IS NOT NULL
      AND o.shipped_out_at + (gs.transit_days || ' days')::INTERVAL <= NOW()
  )
  UPDATE orders o
     SET order_status           = 'DISTRIBUTOR_SHIPPED',
         distributor_shipped_at = COALESCE(o.distributor_shipped_at, NOW())
   WHERE o.id IN (SELECT id FROM eligible);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =====================================================================
-- 7. fn_enqueue_milestone_dispatch — SHIPPED_OUT 를 milestone 에 포함
-- =====================================================================
-- src/constants/notifications.ts MILESTONE_STATUS_KEYS 와 동기화 유지.

CREATE OR REPLACE FUNCTION fn_enqueue_milestone_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_milestones TEXT[] := ARRAY[
    'CARD_DELIVERY_PENDING',
    'SHIPPED_OUT',
    'DISTRIBUTOR_SHIPPED',
    'GRADE_CONFIRMED',
    'READY_FOR_PICKUP',
    'COMPLETED'
  ];
BEGIN
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

COMMIT;
