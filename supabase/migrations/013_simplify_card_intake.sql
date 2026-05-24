-- 013_simplify_card_intake.sql
-- 카드 별명(card_name) 제거 + 앞면 사진(front_image_url) NULLABLE 화
--
-- 배경: 신청 시점에는 그레이딩사 + 서비스 + 매수만 받고, 카드 상세 정보는
-- 카드를 직접 받은 직원이 입력하도록 흐름이 변경됨.
-- - card_name: 별명 개념을 완전 폐기 (앞으로 미사용)
-- - front_image_url: 신청 시 사진 미제출 가능 → NULL 허용 (수령 시 보강)
--
-- ⚠️ 데이터 손실 주의: 기존 card_name 값은 영구 삭제됩니다.

BEGIN;

-- card_name 컬럼 제거
ALTER TABLE cards DROP COLUMN IF EXISTS card_name;

-- front_image_url NULL 허용
ALTER TABLE cards ALTER COLUMN front_image_url DROP NOT NULL;

COMMIT;
