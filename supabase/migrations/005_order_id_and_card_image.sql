-- =====================================================================
-- 005_order_id_and_card_image.sql
--
-- (1) generate_order_id() — 'YYYYMMDD-순번' 포맷 ID 생성 함수
--     - Asia/Seoul 기준 일자 prefix
--     - 일자별 advisory transaction lock 으로 동시성 안전
--     - 동일 일자 내 기존 row 수 + 1 (3자리 zero-pad)
--
-- (2) cards 이미지 컬럼 nullable 전환
--     - 002_redesign 의 front_image_url NOT NULL 제약 완화
--     - Storage 통합 (Supabase Storage / R2) 결정 전까지 임시 허용
--     - 통합 후 별도 마이그레이션으로 NOT NULL 재적용 예정
-- =====================================================================

BEGIN;

-- (1) order ID 생성 함수
CREATE OR REPLACE FUNCTION generate_order_id()
RETURNS TEXT AS $$
DECLARE
  v_date     TEXT := TO_CHAR((NOW() AT TIME ZONE 'Asia/Seoul')::DATE, 'YYYYMMDD');
  v_seq      INTEGER;
  v_lock_key BIGINT;
BEGIN
  -- 일자 문자열을 64bit 키로 압축 (substring으로 BIGINT 영역에 맞춤)
  v_lock_key := ('x' || SUBSTR(MD5(v_date), 1, 15))::BIT(60)::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COUNT(*) + 1 INTO v_seq
    FROM orders
   WHERE id LIKE v_date || '-%';

  RETURN v_date || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_order_id() IS
  'YYYYMMDD-순번(3자리) 형식의 신규 주문 ID 생성. 동일 트랜잭션 내 advisory lock 으로 동시성 안전.';

-- (2) cards 이미지 컬럼 nullable
ALTER TABLE cards ALTER COLUMN front_image_url DROP NOT NULL;
-- back_image_url 은 이미 nullable

COMMENT ON COLUMN cards.front_image_url IS
  '카드 앞면 사진 URL. Storage 통합 전까지 nullable. 통합 후 NOT NULL 재적용 예정.';

COMMIT;
