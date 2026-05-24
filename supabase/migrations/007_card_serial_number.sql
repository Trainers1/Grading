-- 007: cards.serial_number 컬럼 추가
--
-- 용도: 그레이딩사가 발급한 슬랩 인증번호(certification serial). 등급 결과 입력 시
--      함께 기록되어 추후 진위 확인 / 슬랩 추적에 사용.
-- 정책: 기존 행은 NULL 허용 — 등급 확정 취소 시에도 NULL 로 되돌릴 수 있도록.
--      길이 상한 80자(여유). 공백·중복 검사는 응용 레이어에서 수행.

BEGIN;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS serial_number TEXT
  CHECK (serial_number IS NULL OR char_length(serial_number) <= 80);

COMMIT;
