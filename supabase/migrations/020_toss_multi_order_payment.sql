-- 신청 시 결제(토스 페이먼츠 위젯)에서 한 결제 세션이 여러 주문을 한꺼번에 결제할 수 있도록
-- payments.toss_payment_key 의 UNIQUE 제약을 (toss_payment_key, order_id) 복합 키로 완화한다.
--
-- 기존 제약: idx_payments_toss_payment_key (toss_payment_key, partial WHERE NOT NULL)
--   → 동일 paymentKey 로 두 번째 row 를 insert 하면 충돌.
--
-- 동일 paymentKey 가 N 개 row 에 분산 저장되더라도 (paymentKey, order_id) 조합은 유일하므로
-- 동일 주문에 대한 중복 confirm 은 여전히 차단한다.

DROP INDEX IF EXISTS idx_payments_toss_payment_key;

CREATE UNIQUE INDEX idx_payments_toss_payment_key_order
  ON payments(toss_payment_key, order_id)
  WHERE toss_payment_key IS NOT NULL;
