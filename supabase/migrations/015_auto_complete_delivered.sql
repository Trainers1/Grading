-- =====================================================================
-- 015. 택배 발송 주문 5일 후 자동 수령 완료
-- =====================================================================
--
-- user_shipped_at: 택배 송장번호가 최초로 입력된 시각.
--   - setUserTrackingNumberAction 에서 NULL 일 때만 1회 기록 (송장 수정 시 보존).
--   - auto_complete_delivered_orders() 가 "+5일 경과" 판정에 사용.
--
-- auto_complete_delivered_orders():
--   호출자: Vercel Cron → /api/orders/auto-complete-delivered (service-role)
--   대상:   order_status='TRAINERS_ARRIVED' AND pickup_method='DELIVERY'
--           AND cancelled_at IS NULL
--           AND user_shipped_at + 5일 <= NOW()
--   효과:   order_status='COMPLETED' (log_order_status_change 트리거가 이력 기록)
--   반환:   처리된 주문 수.
-- =====================================================================

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_shipped_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION auto_complete_delivered_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH eligible AS (
    SELECT id
      FROM orders
     WHERE order_status   = 'TRAINERS_ARRIVED'
       AND pickup_method  = 'DELIVERY'
       AND cancelled_at IS NULL
       AND user_shipped_at IS NOT NULL
       AND user_shipped_at + INTERVAL '5 days' <= NOW()
  )
  UPDATE orders
     SET order_status = 'COMPLETED'
   WHERE id IN (SELECT id FROM eligible);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION auto_complete_delivered_orders() IS
  '택배 송장 입력 후 5일 경과한 TRAINERS_ARRIVED+DELIVERY 주문을 COMPLETED 로 자동 전환. Vercel Cron /api/orders/auto-complete-delivered 에서 호출.';

COMMIT;
