# Auth Supabase Migration — Smoke Test 가이드

auth-supabase-migration 플랜 S7 산출물. §3.3 E2E 체크리스트, §3.5 한국어 문자열 grep, §6 R1 복구 절차를 포함한다.

---

## 1. 로컬 Supabase 환경 설정

### 1.1 Supabase 로컬 스택 시작

```bash
supabase start
```

### 1.2 마이그레이션 실행

```bash
supabase db reset
# 또는 incremental push:
supabase db push
```

마이그레이션 적용 확인:

```sql
-- admin_users 에 user_id 컬럼이 있는지 확인
\d admin_users
-- expect: user_id uuid UNIQUE REFERENCES auth.users(id) 컬럼 존재
```

### 1.3 Admin 시드 실행 (idempotent)

```bash
# supabase/seed/admin-link.sql 실행
psql "$(supabase db url)" -f supabase/seed/admin-link.sql
```

또는 Supabase Studio SQL 에디터에서 직접 실행:

```sql
UPDATE admin_users a
   SET user_id = u.id
  FROM auth.users u
 WHERE a.email = u.email
   AND a.user_id IS NULL;
```

링크 결과 확인:

```sql
SELECT id, email, user_id, role, is_active
FROM admin_users;
-- expect: user_id IS NOT NULL (auth.users 에 동일 이메일 계정이 있는 경우)
```

### 1.4 `.env.local` 설정

`.env.local.example` 을 복사하고 다음 3개 키를 설정한다:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start 출력의 anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase start 출력의 service_role key>
```

`supabase start` 출력 예시:

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
```

---

## 2. Smoke 스크립트 실행

```bash
node --env-file=.env.local scripts/smoke-auth.mjs
```

### 로컬 Supabase 연결 완료 + admin 시드 완료 시 기대 출력

```
[smoke-auth] case 1: 빈 이메일+비밀번호 → caller-side guard (Supabase 호출 전 차단)... PASS
[smoke-auth] case 2: 잘못된 비밀번호 → signInWithPassword error.code = invalid_credentials... PASS
[smoke-auth] case 3: 비-admin 계정 → admin_users 에 행 없음 (관리자 권한 없음 경로)... SKIP (SMOKE_NON_ADMIN_EMAIL / SMOKE_NON_ADMIN_PASSWORD 미설정 — 비-admin 시드 계정 필요)
[smoke-auth] case 4: admin 계정 → admin_users 에 행 있음 (customer 로그인 차단 경로)... PASS

Total: 4 cases (3 PASS / 1 SKIP / 0 FAIL)

[smoke-auth] OK — 모든 케이스 PASS 또는 SKIP.
```

Case 3 을 PASS 로 만들려면 비-admin 시드 계정을 등록하고 환경변수를 추가한다:

```
SMOKE_NON_ADMIN_EMAIL=test-customer@example.com
SMOKE_NON_ADMIN_PASSWORD=test-password-123
```

### 환경변수 미설정(CI) 기대 출력

```
[smoke-auth] case 1: 빈 이메일+비밀번호 → caller-side guard (Supabase 호출 전 차단)... PASS
[smoke-auth] case 2: 잘못된 비밀번호 → signInWithPassword error.code = invalid_credentials... SKIP (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 미설정)
[smoke-auth] case 3: 비-admin 계정 → admin_users 에 행 없음 (관리자 권한 없음 경로)... SKIP (SUPABASE_SERVICE_ROLE_KEY 미설정 — admin_users 조회 불가)
[smoke-auth] case 4: admin 계정 → admin_users 에 행 있음 (customer 로그인 차단 경로)... SKIP (SUPABASE_SERVICE_ROLE_KEY 미설정 — admin_users 조회 불가)

Total: 4 cases (1 PASS / 3 SKIP / 0 FAIL)

[smoke-auth] OK — 모든 케이스 PASS 또는 SKIP.
```

---

## 3. E2E 수동 체크리스트 (§3.3)

로컬 dev 서버 실행 후 브라우저로 확인:

```bash
pnpm dev
```

- [ ] `/register` 에서 신규 회원가입 → `/login?registered=true` 로 리다이렉트 (이메일 확인 OFF 상태) → 로그인 가능
- [ ] `/login` 에서 일반 유저 로그인 → `/apply` 또는 `redirect` 쿼리 파라미터 경로로 리다이렉트
- [ ] `/login` 에서 admin 계정으로 로그인 시도 → `"관리자 계정은 /admin/login 에서 로그인해 주세요."` 에러 표시
- [ ] `/admin/login` 에서 non-admin 유저 로그인 시도 → `"관리자 권한이 없는 계정입니다."` 에러 표시
- [ ] `/admin/login` 에서 `user_id` 가 연결된 admin 계정 로그인 → `/admin` 대시보드로 리다이렉트
- [ ] `/admin/login` 에서 `admin_users.user_id IS NULL` 인 admin 행의 이메일로 로그인 → `"관리자 권한이 없는 계정입니다."` 에러 표시 + 서버 콘솔에 `[auth] requireAdmin denied` warn 로그 출력
- [ ] `/mypage` 에서 로그아웃 → 쿠키 삭제 → `/apply` 접근 시 `/login` 으로 리다이렉트
- [ ] Supabase 장애 시뮬 (`.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 을 잘못된 값으로 변경 후 `pnpm dev` 재시작):
  - 공개 페이지(`/`, `/privacy`, `/terms`) 정상 렌더링
  - `/apply`, `/mypage` → `/login` 리다이렉트
  - `/admin/**` → `/admin/login` 리다이렉트
  - 흰 화면(white screen) 없음
- [ ] 아래 §4 한국어 문자열 grep 전체 통과

---

## 4. 한국어 문자열 Presence/Absence grep (§3.5)

리포지토리 루트에서 실행한다. 모든 명령이 결과를 출력해야 하며, absence 검사는 출력이 없어야 한다.

### MUST be present (결과가 출력되어야 함)

```bash
grep -F "이메일과 비밀번호를 입력해 주세요." src/lib/auth/actions.ts
# 기대: actions.ts:46 에 해당 문자열

grep -F "이메일 또는 비밀번호가 올바르지 않습니다." src/lib/auth/actions.ts
# 기대: actions.ts:69 에 해당 문자열

grep -F "관리자 계정은 /admin/login 에서 로그인해 주세요." src/lib/auth/actions.ts
# 기대: actions.ts:80 에 해당 문자열

grep -F "관리자 권한이 없는 계정입니다." src/lib/auth/actions.ts
# 기대: actions.ts:88 에 해당 문자열

grep -F "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." src/lib/auth/actions.ts
# 기대: actions.ts:18 에 해당 문자열 (FALLBACK_ERROR 상수)
```

### MUST be absent (출력이 없어야 함)

```bash
grep -rF "임시 로그인" src/
# 기대: 출력 없음 (temp-auth 삭제 완료)

grep -rl "temp-auth" src/ --include="*.ts" --include="*.tsx"
# 기대: 출력 없음 (temp-auth shim 파일 없음)
# 주의: src/ 의 AGENTS.md 파일에는 삭제 이력 언급이 남아있을 수 있으나
#       실제 .ts/.tsx 파일에 temp-auth import 가 없으면 통과로 간주한다
```

### Windows PowerShell 대응 명령

PowerShell 환경에서는 `grep` 대신 `Select-String` 을 사용한다:

```powershell
# presence 확인 예시
Select-String -LiteralPath src/lib/auth/actions.ts -Pattern "이메일과 비밀번호를 입력해 주세요."

# absence 확인 예시 (출력이 없어야 함)
Get-ChildItem -Recurse src/ -Include *.ts,*.tsx | Select-String -Pattern "임시 로그인"
```

---

## 5. Manual SQL Recovery (§6 R1)

admin 계정이 `auth.users` 에 생성됐으나 `admin_users.user_id` 가 연결되지 않아 로그인이 막히는 경우 복구 절차:

```sql
-- 1. admin 이메일로 auth UUID 조회
SELECT id FROM auth.users WHERE email = '<admin-email>';

-- 2. admin_users 에 user_id 연결
UPDATE admin_users SET user_id = '<auth-uid>' WHERE email = '<admin-email>';

-- 3. 연결 확인
SELECT id, email, user_id, role, is_active
FROM admin_users
WHERE email = '<admin-email>';
-- expect: user_id = '<auth-uid>'
```

idempotent 시드 스크립트로 일괄 복구하려면:

```sql
UPDATE admin_users a
   SET user_id = u.id
  FROM auth.users u
 WHERE a.email = u.email
   AND a.user_id IS NULL;
```

> **참고:** 2회/월 이상 수동 복구가 필요하면 Follow-up F9 (최초 로그인 시 자동 self-link) 재검토. §4 ADR Follow-ups 참조.

---

## 6. 참고 링크

- 플랜 파일: `.omc/plans/auth-supabase-migration.md`
- DB 마이그레이션: `supabase/migrations/004_admin_user_id.sql`
- Admin 시드: `supabase/seed/admin-link.sql`
- Server Actions: `src/lib/auth/actions.ts`
- Admin 인증 guard: `src/lib/auth/require-admin.ts`
- Korean string 인벤토리: 플랜 §7
