-- =====================================================================
-- 004_admin_user_id.sql
-- admin_users 를 auth.users 와 UUID 로 링크 (additive, nullable)
--
-- 배경:
--   002_redesign 의 admin_users 는 email 단일 식별자만 가지며,
--   is_admin() 헬퍼도 auth.users.email -> admin_users.email 매핑에 의존했다.
--   email 변경 / 동명 계정 충돌 위험을 제거하고 안정적인 FK 를 확보하기 위해
--   nullable user_id 컬럼을 추가한다.
--
-- 운영 정책:
--   - 본 마이그레이션은 추가만 수행한다(컬럼 nullable). 누락된 admin 행을
--     선택적으로 채울 수 있도록 seed/admin-link.sql 을 별도 제공한다.
--   - 추후 F-AUTH F7: 003_admin_user_id_required.sql (예정) 로 NOT NULL 전환.
--     전환 조건: SELECT COUNT(*) FROM admin_users WHERE user_id IS NULL = 0
--
-- 적용 순서:
--   001 -> 002_redesign -> 003_pwa_push -> 004_admin_user_id
-- =====================================================================

BEGIN;

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);

-- is_admin() 갱신: email 매핑 대신 user_id 우선 조회.
-- user_id 가 NULL 인 레거시 행을 위해 email 폴백 유지 (전환기 안전망).
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1) 안정 경로: user_id 매칭
  IF EXISTS (
    SELECT 1 FROM admin_users
     WHERE user_id = v_uid
       AND is_active = TRUE
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2) 전환기 폴백: email 매칭 (user_id 가 아직 링크되지 않은 행)
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM admin_users
     WHERE email = v_email
       AND is_active = TRUE
       AND user_id IS NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON COLUMN admin_users.user_id IS
  'auth.users(id) 링크. NULL 허용 (전환기). F-AUTH F7 에서 NOT NULL 로 전환.';

COMMIT;
