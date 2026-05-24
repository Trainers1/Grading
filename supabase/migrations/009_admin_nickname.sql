-- =====================================================================
-- 009. 관리자 로그인 방식 전환 — 닉네임 기반
-- =====================================================================
--
-- 변경:
--   1) admin_users 에 nickname TEXT UNIQUE 추가
--      → 운영자가 로그인 화면에서 닉네임 드롭다운으로 선택, 비밀번호로 인증
--   2) email 은 내부 Supabase Auth 매핑용으로만 사용 (가짜 이메일 OK)
--   3) status / 가입 신청 워크플로우는 사실상 미사용이 되지만 컬럼 자체는
--      보존 — 기존 신청 이력 보호 + RLS 정책 호환성 유지.
--
-- 호환성:
--   기존 admin_users 행은 name 값을 nickname 으로 백필.
--   동일 name 충돌 시 _2, _3 같은 suffix 자동 부여.
-- =====================================================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS nickname TEXT;

-- 기존 행 백필: name → nickname. 중복은 row_number 로 suffix.
WITH ranked AS (
  SELECT id, name,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at) AS rn
    FROM admin_users
   WHERE nickname IS NULL
)
UPDATE admin_users a
   SET nickname = CASE WHEN r.rn = 1 THEN r.name
                       ELSE r.name || '_' || r.rn::TEXT
                  END
  FROM ranked r
 WHERE a.id = r.id;

ALTER TABLE admin_users
  ALTER COLUMN nickname SET NOT NULL;

-- UNIQUE 제약 (대소문자 구분 — 운영 정책상 충돌 없도록 슈퍼관리자가 결정)
ALTER TABLE admin_users
  ADD CONSTRAINT admin_users_nickname_key UNIQUE (nickname);

CREATE INDEX IF NOT EXISTS idx_admin_users_nickname ON admin_users(nickname);

COMMENT ON COLUMN admin_users.nickname IS
  '로그인 화면 드롭다운에서 노출되는 식별자. UNIQUE. Supabase Auth 의 email 은 내부 매핑용 (가짜 이메일 허용).';
