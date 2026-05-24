-- =====================================================================
-- reset_orders_and_cards.sql
-- 주문 / 카드 관련 데이터 전체 초기화 스크립트.
--
-- 유지(보존)되는 것:
--   * profiles          — 사용자 계정 (auth.users 와 연동)
--   * admin_users       — 관리자 계정
--   * grading_services  — 등급 서비스 카탈로그
--   * consent_logs      — 약관 동의 이력 (법적 보관 의무)
--   * push_subscriptions — 푸시 구독 (주문과 무관)
--   * 모든 스키마 / 함수 / 트리거 / RLS 정책
--
-- 삭제되는 것 (주문 라이프사이클 전체):
--   1. orders                — 주문 본체
--   2. cards                 — 카드 (orders FK CASCADE)
--   3. order_status_logs     — 주문 상태 변경 이력 (orders FK CASCADE)
--   4. order_receipt_photos  — 어드민 수령 사진 (orders FK CASCADE)
--   5. payments              — 결제 내역 (orders FK RESTRICT → 명시 삭제 필요)
--   6. batches               — 배치 발송
--   7. batch_orders          — 배치-주문 매핑 (orders FK RESTRICT → 명시 삭제 필요)
--   8. notifications_outbox  — 푸시 알림 outbox (orders FK CASCADE)
--
-- (선택) Storage:
--   * card-images 버킷 내 모든 객체 — 아래 별도 섹션에서 주석 처리되어 있음.
--     Storage 까지 비우려면 해당 섹션 주석 해제.
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor 에 본 파일 전체를 붙여넣고 실행.
--   service_role 권한으로 실행 권장 (RLS 우회).
--   트랜잭션으로 감싸져 있어 중간 실패 시 전체 롤백.
--
-- 주의:
--   * 이 스크립트는 되돌릴 수 없습니다. 운영 환경에서는 백업 후 실행.
--   * TRUNCATE 는 트리거(log_order_status_change 등)를 호출하지 않으므로
--     데이터만 삭제되고 부수 효과는 발생하지 않음.
--   * UUID 기반 PK 라 시퀀스 리셋은 사실상 no-op 이지만 안전을 위해 포함.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. 주문 / 카드 / 결제 / 배치 / 알림 outbox 전체 비우기
--    CASCADE 옵션으로 FK RESTRICT (payments, batch_orders) 도 함께 처리.
--    한 문장에 묶어 FK 순서 고민 없이 원자적으로 비운다.
-- ---------------------------------------------------------------------

TRUNCATE TABLE
  notifications_outbox,
  payments,
  batch_orders,
  batches,
  order_receipt_photos,
  order_status_logs,
  cards,
  orders
RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------
-- 2. 검증 — 각 테이블 row count 가 모두 0 이어야 함
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_orders                INT;
  v_cards                 INT;
  v_order_status_logs     INT;
  v_order_receipt_photos  INT;
  v_payments              INT;
  v_batches               INT;
  v_batch_orders          INT;
  v_notifications_outbox  INT;
BEGIN
  SELECT COUNT(*) INTO v_orders               FROM orders;
  SELECT COUNT(*) INTO v_cards                FROM cards;
  SELECT COUNT(*) INTO v_order_status_logs    FROM order_status_logs;
  SELECT COUNT(*) INTO v_order_receipt_photos FROM order_receipt_photos;
  SELECT COUNT(*) INTO v_payments             FROM payments;
  SELECT COUNT(*) INTO v_batches              FROM batches;
  SELECT COUNT(*) INTO v_batch_orders         FROM batch_orders;
  SELECT COUNT(*) INTO v_notifications_outbox FROM notifications_outbox;

  RAISE NOTICE '── 초기화 결과 ──';
  RAISE NOTICE 'orders               : %', v_orders;
  RAISE NOTICE 'cards                : %', v_cards;
  RAISE NOTICE 'order_status_logs    : %', v_order_status_logs;
  RAISE NOTICE 'order_receipt_photos : %', v_order_receipt_photos;
  RAISE NOTICE 'payments             : %', v_payments;
  RAISE NOTICE 'batches              : %', v_batches;
  RAISE NOTICE 'batch_orders         : %', v_batch_orders;
  RAISE NOTICE 'notifications_outbox : %', v_notifications_outbox;

  IF (v_orders + v_cards + v_order_status_logs + v_order_receipt_photos
      + v_payments + v_batches + v_batch_orders + v_notifications_outbox) <> 0
  THEN
    RAISE EXCEPTION '초기화 실패 — 일부 테이블에 데이터가 남아 있습니다. 롤백합니다.';
  END IF;
END
$$;

COMMIT;

-- =====================================================================
-- (선택) Storage card-images 버킷 비우기
--   카드 앞면 이미지 파일들이 storage 에 남아 있으면 고아 파일이 됩니다.
--   완전한 초기화를 원한다면 아래 블록의 주석을 해제하세요.
--   주의: 이 작업도 되돌릴 수 없습니다.
-- =====================================================================

-- BEGIN;
--
-- DELETE FROM storage.objects WHERE bucket_id = 'card-images';
--
-- DO $$
-- DECLARE
--   v_remaining INT;
-- BEGIN
--   SELECT COUNT(*) INTO v_remaining
--     FROM storage.objects WHERE bucket_id = 'card-images';
--   RAISE NOTICE 'card-images 잔여 객체: %', v_remaining;
--   IF v_remaining <> 0 THEN
--     RAISE EXCEPTION 'Storage 초기화 실패 — 객체가 남아 있습니다.';
--   END IF;
-- END
-- $$;
--
-- COMMIT;
