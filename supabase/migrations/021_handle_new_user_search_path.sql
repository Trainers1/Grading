-- 021_handle_new_user_search_path.sql
-- 회원가입 5xx 픽스 — handle_new_user 트리거가 auth.users INSERT 컨텍스트에서
-- search_path 에 public 이 없어 "relation profiles does not exist" 로 실패하던 문제.
--
-- 두 줄로 belt-and-suspenders:
--   1) SET search_path = public, pg_catalog  ← 함수 실행 시 검색 경로 고정
--   2) INSERT INTO public.profiles            ← 테이블 스키마 명시
--
-- SECURITY DEFINER 함수는 권한 상승 공격 방어를 위해 search_path 고정이 권장됨.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.profiles (
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
$$;
