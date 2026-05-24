-- =====================================================================
-- 008. 관리자 가입 승인 워크플로우
-- =====================================================================
--
-- 변경:
--   1) admin_users 에 status / requested_at / approved_at / approved_by 추가
--   2) admin_users.role 을 nullable 로 — 가입 신청 시점에는 역할 미정
--   3) is_admin() 함수에 status='APPROVED' 조건 추가
--      → PENDING/REJECTED 행은 어드민 권한을 갖지 않음
--   4) RLS 정책: admin_users 본인 행은 조회 가능하도록 보강 (가입자 자기 상태 확인용)
--
-- 호환성:
--   기존 admin_users 행은 모두 status='APPROVED' 로 백필 — 시드 어드민 보호.
--   role 이 이미 NOT NULL 이었으므로 nullable 화는 신규 신청자에만 영향.
-- =====================================================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL;

-- 기존 행은 모두 승인 상태로 백필 (slug 시드 보호)
UPDATE admin_users
   SET status = 'APPROVED',
       approved_at = COALESCE(approved_at, created_at)
 WHERE status = 'PENDING';

-- role nullable 화 (신규 PENDING 가입자는 역할 미정)
ALTER TABLE admin_users
  ALTER COLUMN role DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_status ON admin_users(status);

-- is_admin() 갱신 — APPROVED + is_active 만 통과
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_users a
    JOIN auth.users u ON u.email = a.email
    WHERE u.id = auth.uid()
      AND a.is_active = TRUE
      AND a.status = 'APPROVED'
  );
$$;

-- RLS: 본인 행은 항상 SELECT 허용 (가입 신청 직후 자기 status 확인용)
-- 기존 admin_users_admin_all 정책과 공존 — 어드민은 전체, 본인은 자기 행만.
DROP POLICY IF EXISTS admin_users_self_read ON admin_users;
CREATE POLICY admin_users_self_read ON admin_users
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

COMMENT ON COLUMN admin_users.status IS
  '가입 승인 상태. PENDING(대기) → APPROVED(승인) / REJECTED(거부). is_admin() 은 APPROVED + is_active 만 통과.';
COMMENT ON COLUMN admin_users.role IS
  'PENDING 상태에서는 NULL. APPROVED 시 SUPER_ADMIN 이 역할 부여.';
