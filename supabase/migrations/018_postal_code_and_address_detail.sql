-- 018_postal_code_and_address_detail.sql
-- 주소를 (우편번호, 기본 주소, 상세 주소) 3 컬럼 구조로 확장.
-- profiles 와 orders 양쪽에 추가하며, 기존 address / delivery_address 는
-- "기본 주소" 의미로 그대로 유지된다.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS postal_code     TEXT,
  ADD COLUMN IF NOT EXISTS address_detail  TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS postal_code              TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address_detail  TEXT;

-- handle_new_user 트리거가 raw_user_meta_data 의 postal_code/address_detail 까지
-- 함께 채우도록 갱신.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (
    id,
    email,
    name,
    phone,
    provider,
    postal_code,
    address,
    address_detail,
    bank_name,
    account_number,
    account_holder
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'provider', 'email'),
    NULLIF(NEW.raw_user_meta_data->>'postal_code', ''),
    NULLIF(NEW.raw_user_meta_data->>'address', ''),
    NULLIF(NEW.raw_user_meta_data->>'address_detail', ''),
    NULLIF(NEW.raw_user_meta_data->>'bank_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'account_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'account_holder', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
