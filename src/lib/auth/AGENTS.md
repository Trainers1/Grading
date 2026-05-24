<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-05-12 -->

# auth

## Purpose
Supabase Auth 기반 인증/권한 계층. `auth.users` 를 단일 신원 출처로 삼고, admin 권한은 `admin_users.user_id` 링크로 판정한다. 임시 하드코딩 계정(`temp-auth`)은 2026-05-12 제거됨.

## Key Files

| File | Description |
|------|-------------|
| `actions.ts` | `"use server"` 서버 액션. `signInAction({ email, password, expectedRole, redirectTo })` 는 `supabase.auth.signInWithPassword` 후 expectedRole 과 admin 매칭 여부를 교차 검증. `signUpAction({ email, password, name, phone })` 는 `supabase.auth.signUp` 호출 (email-confirm OFF, F2 에서 ON 전환 예정). `signOutAction` / `signOutAdminAction` 은 `auth.signOut()` 후 각각 `/` , `/admin/login` 으로 redirect |
| `require-admin.ts` | 서버 전용 — `requireAdmin(): Promise<AdminSession \| null>`. 1) `supabase.auth.getUser()` 로 세션 확인 → 2) service-role 클라이언트로 `admin_users.user_id = auth.user.id` 조회 → 3) 폴백: `admin_users.email = auth.user.email AND user_id IS NULL` (전환기). 결과는 `{ authUserId, adminId, adminRole, email, name }` |

## For AI Agents

### Working In This Directory
- **`require-admin.ts` 는 서버 전용** — `"use client"`, Edge runtime, 미들웨어에서 import 금지 (서비스 롤 키 노출 차단).
- **미들웨어는 admin role 검증을 하지 않는다** — `src/lib/supabase/middleware.ts` 는 "로그인 여부" 만 확인하고, admin 페이지의 실제 권한 검증은 Server Component 에서 `requireAdmin()` 으로 수행. 이유: 미들웨어 hot path 에서 DB 조회 비용 회피.
- **admin 링크 정책** — `admin_users` 행은 SQL 로 선등록 후 `supabase/seed/admin-link.sql` 로 `user_id` 를 채운다. 자동 self-link 미구현 (R1 — 이메일 충돌 공격 표면 회피). 락아웃 시 수동 SQL 복구:
  ```sql
  SELECT id FROM auth.users WHERE email = '<admin-email>';
  UPDATE admin_users SET user_id = '<auth-uid>' WHERE email = '<admin-email>';
  ```
- **`order_status_logs.changed_by`** 작성 시 `adminSession.adminId` (= `admin_users.id`) 를 쓴다 (`authUserId` 아님). column comment "어드민 ID 또는 시스템" 호환.
- **로그인 페이지의 클라이언트측 빈 입력 가드** (`"이메일과 비밀번호를 입력해 주세요."`) 는 의도적으로 보존 — 서버측 동일 메시지가 정본이며 UX 응답속도 차원에서 중복 가드 유지.
- **Server Action 호출 패턴** — `onSubmit + useTransition` 사용. `<form action>` 패턴은 사용하지 않음 (양쪽 모두 Next.js Server Action ID 핑거프린팅으로 CSRF 안전).
- **5xx fallback** — Supabase 비-credential 예외 시 `"로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."` 반환. `signInAction` catch 브랜치에 위치.

### Env / 누락 처리
- `NEXT_PUBLIC_SUPABASE_URL` 또는 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 누락: 미들웨어가 모든 보호 경로를 로그인 페이지로 우회 (관리자 컨텍스트 부여 금지).
- `SUPABASE_SERVICE_ROLE_KEY` 누락: `requireAdmin()` 이 `console.error` 로그 후 `null` 반환 → admin 페이지는 `/admin/login` 으로 redirect. **절대 silently allow 금지**.

## Dependencies

### Internal
- `@/lib/supabase/server` — anon 세션 클라이언트 (쿠키 기반)
- `@/lib/supabase/service` — service-role 클라이언트 (RLS 우회)
- `next/headers`, `next/navigation` (서버 전용)

### External (`@supabase/ssr`, `@supabase/supabase-js`)
- `signInWithPassword`, `signUp`, `signOut`, `getUser`

<!-- MANUAL: -->
