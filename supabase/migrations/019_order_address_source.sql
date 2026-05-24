-- 019_order_address_source.sql
-- 주문의 배송 주소가 "내 주소"(회원 정보 기반)인지 "직접 입력"인지를 기록한다.
--
-- 의도:
--   address_source = 'MY'    → 발송/조회 시 항상 profiles 최신 주소를 사용.
--                              orders.postal_code/delivery_address/_detail 컬럼은
--                              감사용 snapshot 으로만 유지 (fallback / 디버깅).
--   address_source = 'MANUAL'→ 신청 시 입력한 snapshot 주소를 그대로 사용.
--
-- 기존 데이터: 모두 'MANUAL' 로 채워 기존 동작을 유지한다.
-- 새 신청: createOrdersAction 이 사용자의 선택에 따라 'MY' 또는 'MANUAL' 로 기록.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS address_source TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (address_source IN ('MY', 'MANUAL'));
