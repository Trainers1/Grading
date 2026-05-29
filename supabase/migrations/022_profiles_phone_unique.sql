-- 022_profiles_phone_unique.sql
-- 회원가입 시 연락처(phone) 중복 방지를 위한 partial unique index.
--
-- 왜 partial index?
--   - profiles.phone 은 NOT NULL TEXT 이고 신청 폼은 비공백을 강제하지만,
--     trigger 는 COALESCE(..., '') 로 입력. legacy 데이터에 빈 문자열 또는
--     NULL 이 섞여 있을 수 있어 일반 UNIQUE 는 충돌 가능.
--   - 의미 없는 빈/NULL 값은 중복 검사 대상에서 제외한다.
--
-- 이메일은 auth.users.email 단에서 이미 UNIQUE 이므로 profiles 측 인덱스 불필요.
--
-- 적용 후 동작:
--   - 신규 가입에서 같은 010-XXXX-XXXX 가 이미 있으면 trigger insert 시점에
--     unique_violation → "Database error saving new user" 로 표면화된다.
--   - signUpAction 사전 체크 가 대부분의 경우를 미리 차단하므로 이 index 는
--     동시 가입 race condition 의 fail-safe 역할이다.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_profiles_phone_nonblank
  ON public.profiles (phone)
  WHERE phone IS NOT NULL AND phone <> '';
