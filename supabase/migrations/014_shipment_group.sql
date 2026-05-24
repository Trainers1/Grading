-- 014_shipment_group.sql
-- 합배송(combined shipping) 지원 — 여러 주문을 하나의 택배로 묶어 한 번에 발송.
--
-- shipment_group_id:
--   - 택배비 결제 시 발급되는 UUID. 같은 묶음(한 박스)으로 발송되는 주문들이 공유한다.
--   - NULL     = 택배비 미결제 → /admin/batches 의 "결제 대기"
--   - 비-NULL   = 택배비 결제 완료. 같은 값의 주문들은 한 송장으로 함께 발송된다.
--   - 단건 결제도 주문 1개짜리 그룹으로 표현된다.
--   "택배비 결제 완료" 의 단일 판단 기준 (이전의 shipping_fee > 0 기준을 대체).

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_shipment_group
  ON orders(shipment_group_id);

COMMIT;
