-- =====================================================================
-- 010. 관리자 역할 단순화 — 3종으로 통합
-- =====================================================================
--
-- 변경:
--   기존 4종 (SUPER_ADMIN / STORE_MANAGER / GRADING_MANAGER / CS_AGENT)
--   → 신규 3종 (SUPER_ADMIN / GENERAL_ADMIN / STORE_SHARED)
--
--   매핑:
--     SUPER_ADMIN      → SUPER_ADMIN      (그대로)
--     STORE_MANAGER    → GENERAL_ADMIN
--     GRADING_MANAGER  → GENERAL_ADMIN
--     CS_AGENT         → GENERAL_ADMIN
--     (STORE_SHARED 는 신규 — 010 적용 직후엔 행 없음)
--
-- 절차:
--   1) 기존 CHECK 제약 DROP
--   2) 데이터 마이그레이션 (UPDATE)
--   3) 신규 CHECK 제약 ADD
-- =====================================================================

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_role_check;

UPDATE admin_users
   SET role = 'GENERAL_ADMIN'
 WHERE role IN ('STORE_MANAGER', 'GRADING_MANAGER', 'CS_AGENT');

ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_role_check
    CHECK (role IN ('SUPER_ADMIN', 'GENERAL_ADMIN', 'STORE_SHARED'));

COMMENT ON COLUMN admin_users.role IS
  '관리자 역할 3종. SUPER_ADMIN(전체 설정/관리자 추가) / GENERAL_ADMIN(일반 운영) / STORE_SHARED(매장 공유 계정). PENDING 상태에서는 NULL.';
