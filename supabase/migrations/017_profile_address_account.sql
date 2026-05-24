-- 017_profile_address_account.sql
-- profiles 에 선택 입력용 주소/계좌 정보 컬럼 추가.
-- 회원가입 시 입력은 선택사항이며 내정보 화면에서 언제든지 수정 가능.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS bank_name       TEXT,
  ADD COLUMN IF NOT EXISTS account_number  TEXT,
  ADD COLUMN IF NOT EXISTS account_holder  TEXT;

-- handle_new_user 트리거가 raw_user_meta_data 의 address/bank/account 까지 채우도록 갱신.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (
    id,
    email,
    name,
    phone,
    provider,
    address,
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
    NULLIF(NEW.raw_user_meta_data->>'address', ''),
    NULLIF(NEW.raw_user_meta_data->>'bank_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'account_number', ''),
    NULLIF(NEW.raw_user_meta_data->>'account_holder', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
