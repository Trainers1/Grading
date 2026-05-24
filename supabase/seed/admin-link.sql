-- =====================================================================
-- admin-link.sql
-- admin_users.user_id 를 email 매칭으로 일괄 링크 (idempotent)
--
-- 사용 시점:
--   - 004_admin_user_id 적용 직후
--   - 새 admin 계정을 auth.users 에 추가한 직후
--   - 운영자 락아웃 복구 시 (수동 SQL recovery)
--
-- 재실행 안전:
--   user_id IS NULL 행만 갱신. 두 번째 호출은 no-op.
-- =====================================================================

UPDATE admin_users a
   SET user_id = u.id,
       updated_at = NOW()
  FROM auth.users u
 WHERE LOWER(a.email) = LOWER(u.email)
   AND a.user_id IS NULL;

-- 결과 확인용 (실행 후 0 이면 모든 admin 이 링크됨)
SELECT COUNT(*) AS unlinked_admin_count
  FROM admin_users
 WHERE user_id IS NULL;
