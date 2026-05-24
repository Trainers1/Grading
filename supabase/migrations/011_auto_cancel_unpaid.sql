-- =====================================================================
-- 011. 결제 미완료 주문 자동 취소 RPC
-- =====================================================================
--
-- 정책: 주문 신청(created_at) 후 3일이 지나도록 결제가 이뤄지지 않은
--       (order_status='PAYMENT_PENDING' AND cancelled_at IS NULL) 주문을
--       자동 취소 처리한다 (cancelled_at + cancel_reason 기록).
--
-- 호출자: Vercel Cron → /api/orders/auto-cancel-unpaid (service-role)
-- 반환:   처리된 주문 수.
--
-- 부수 효과:
--   - 주문 상태(order_status)는 그대로 PAYMENT_PENDING 으로 보존 (이력 유지).
--   - cancelled_at 만 세팅되어 활성/취소 scope 필터에서 "취소됨" 으로 분류.
--   - 후속 환불·결제 row 정리는 별도 운영 절차.
-- =====================================================================

CREATE OR REPLACE FUNCTION auto_cancel_unpaid_orders()
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
     WHERE order_status = 'PAYMENT_PENDING'
       AND cancelled_at IS NULL
       AND created_at + INTERVAL '3 days' <= NOW()
  )
  UPDATE orders
     SET cancelled_at  = NOW(),
         cancel_reason = COALESCE(cancel_reason,
                                  '신청 후 3일 이상 결제 미완료로 자동 취소되었습니다.')
   WHERE id IN (SELECT id FROM eligible);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION auto_cancel_unpaid_orders() IS
  '신청 후 3일 이상 결제 미완료인 PAYMENT_PENDING 주문을 자동 취소. Vercel Cron /api/orders/auto-cancel-unpaid 에서 호출.';
