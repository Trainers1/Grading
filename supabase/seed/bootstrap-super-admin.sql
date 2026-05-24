-- =====================================================================
-- bootstrap-super-admin.sql
-- 첫 번째 SUPER_ADMIN 계정을 수동으로 심는 시드.
--
-- 사용 시점:
--   - 009 마이그레이션 직후, /admin 에 들어갈 첫 운영자가 한 명도 없을 때
--   - 운영자 락아웃(모든 슈퍼관리자 비활성/삭제) 복구 시
--
-- 사전 조건:
--   1) Supabase Dashboard → Authentication → Users → "Add user" 로
--      Auth 사용자를 먼저 생성한다. (이메일 형식이면 무엇이든 OK)
--        · Email: bootstrap@admin.trainers.local  (예시 — 원하는 값 사용)
--        · Password: 000000                        (정책 우회는 dashboard 가 처리)
--        · "Auto Confirm User" 체크 ON
--   2) 생성된 row 의 UUID 를 복사해 아래 :BOOTSTRAP_AUTH_UID 자리에 붙여 넣는다.
--      (psql 변수 미지원 환경이면 그냥 문자열 치환)
--
-- 재실행 안전:
--   nickname UNIQUE 제약으로 중복 INSERT 는 실패한다. 이미 동일 닉네임이 있으면
--   기존 행을 SUPER_ADMIN 으로 격상하는 두 번째 UPDATE 구문만 effect.
-- =====================================================================

-- 1) 신규 슈퍼관리자 행 삽입 (이미 있으면 ON CONFLICT 로 무시 → 다음 UPDATE 가 보강)
INSERT INTO admin_users (
  email,
  nickname,
  name,
  role,
  user_id,
  is_active,
  status,
  requested_at,
  approved_at
) VALUES (
  'bootstrap@admin.trainers.local',
  'admin',
  '슈퍼관리자',
  'SUPER_ADMIN',
  ':BOOTSTRAP_AUTH_UID'::UUID,   -- ← Dashboard 에서 만든 auth user UUID 로 치환
  TRUE,
  'APPROVED',
  NOW(),
  NOW()
)
ON CONFLICT (nickname) DO NOTHING;

-- 2) 동일 닉네임 행이 이미 있던 경우 SUPER_ADMIN + 활성으로 강제 보강
UPDATE admin_users
   SET role        = 'SUPER_ADMIN',
       is_active   = TRUE,
       status      = 'APPROVED',
       approved_at = COALESCE(approved_at, NOW()),
       user_id     = COALESCE(user_id, ':BOOTSTRAP_AUTH_UID'::UUID)
 WHERE nickname = 'admin';

-- 3) 결과 확인
SELECT id, nickname, name, role, status, is_active, user_id
  FROM admin_users
 WHERE nickname = 'admin';
