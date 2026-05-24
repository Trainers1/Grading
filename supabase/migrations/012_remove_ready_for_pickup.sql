-- Migration 012: READY_FOR_PICKUP 상태 제거 → TRAINERS_ARRIVED로 통합
--
-- 배경: TRAINERS_ARRIVED와 READY_FOR_PICKUP은 워크플로상 사실상 동일 단계로 운용되어
-- 두 상태를 별개로 유지할 필요가 없어졌다. 단일 TRAINERS_ARRIVED 로 통합.
--
-- 적용 순서:
--   1) 기존 READY_FOR_PICKUP 행을 TRAINERS_ARRIVED 로 이전
--   2) order_status CHECK 제약에서 READY_FOR_PICKUP 제거
--   3) fn_enqueue_milestone_dispatch 의 milestone 배열에서 READY_FOR_PICKUP → TRAINERS_ARRIVED 로 교체
--
-- 주의: 이 마이그레이션 적용 전에 코드 배포가 선행되면 READY_FOR_PICKUP 신규 INSERT 가
--      차단된다. 반대로 코드 배포보다 먼저 적용해도 기존 데이터 호환을 위해 함수가
--      유효하게 동작한다.

BEGIN;

-- 1) 기존 READY_FOR_PICKUP 행을 TRAINERS_ARRIVED 로 이전
UPDATE orders
   SET order_status = 'TRAINERS_ARRIVED'
 WHERE order_status = 'READY_FOR_PICKUP';

-- 2) order_status CHECK 제약 갱신 (READY_FOR_PICKUP 제거)
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check CHECK (order_status IN (
    'PAYMENT_PENDING',
    'CARD_DELIVERY_PENDING',
    'CARD_RECEIVED',
    'SHIPPED_OUT',
    'DISTRIBUTOR_SHIPPED',
    'GRADE_CONFIRMED',
    'TRAINERS_ARRIVED',
    'COMPLETED'
  ));

-- 3) milestone 함수 갱신 — READY_FOR_PICKUP 제거하고 TRAINERS_ARRIVED 로 교체.
--    (src/constants/notifications.ts MILESTONE_STATUS_KEYS 와 동기 유지)
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
    'TRAINERS_ARRIVED',
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
