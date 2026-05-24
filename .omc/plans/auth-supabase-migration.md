# Auth Supabase Migration — Consensus Plan

**Status:** APPROVED (ralplan consensus, round 2 of 5)
**Mode:** RALPLAN-DR DELIBERATE (auth/security)
**Generated:** 2026-04-26
**Scope tag:** `auth-supabase-migration`

## Consensus Trail

| Round | Planner | Architect | Critic |
|---|---|---|---|
| 1 | Initial plan | ITERATE — 4 mandatory + 3 recommended | ITERATE — 6 blocking + 4 recommended |
| 2 | Revised | ITERATE — 1 blocking + 4 polish (downgraded by Critic) | **APPROVE** |

Critic's final note: Architect's blocking concern (smoke-auth.mjs prose overstating coverage) was downgraded to a documentation note because the artifacts already exist and §3.5 grep tests cover the Korean-string surface area. Three documentation notes apply during executor implementation; see "Executor Handoff Notes" at the end of this document.

---

## 1. RALPLAN-DR Summary

### Principles
1. **Defence in depth** — never trust a single layer (middleware OR Server Component) for auth on admin routes.
2. **Server is authoritative** — auth state flows from Supabase cookies + DB; client UI is a hint, never the gate.
3. **Reversible by `git revert`** — temp-auth removal is one PR, additive DB migration, no parallel-cookie systems.
4. **Korean copy is contract** — every user-facing string is enumerated, owned, and verified by grep before/after.
5. **Match existing patterns** — Server Actions in `src/lib/auth/actions.ts`, Supabase clients in `src/lib/supabase/{client,server,middleware}.ts`. New module `src/lib/supabase/admin.ts` for service-role only.

### Decision Drivers
1. **Security** — admin route bypass is the catastrophic failure mode; everything else is recoverable.
2. **Footprint** — temp-auth is 3 files + 4 import sites; keep PR scope tight.
3. **Reversibility** — single PR, additive SQL, no destructive column drops in same migration.

### Decisions

| ID | Decision | Choice | Rationale |
|----|----------|--------|-----------|
| A | `admin_users` ↔ `auth.users` linkage | **A1** — additive `user_id UUID UNIQUE REFERENCES auth.users(id)` (nullable) | Avoids destructive PK churn; idempotent seed; F7 flips NOT NULL once linked |
| B | Admin route protection model | **B1** — middleware path-gate + `requireAdmin()` in Server Components/Actions | Defence in depth; middleware can't run on streaming sub-segments |
| C | Register flow Supabase wiring | **C2** — `supabase.auth.signUp` with `options.data = { name, phone }`, trigger populates `profiles` | Existing `handle_new_user` trigger; closes `console.log` stub at `register/page.tsx:99-100` |
| D | Temp-auth removal strategy | **D1** — big-bang single PR | 3 files + 4 import sites; gradual would carry parallel-cookie complexity for no benefit |

#### Decision A — option set with A4-as-cache rebuttal

- **A1 (chosen)** — Additive `user_id` column, DB authoritative on every admin-protected request.
- **A2 (rejected)** — Replace `admin_users.id` PK with `auth.users.id`. Destructive; FK cascade impact on `order_status_logs.changed_by`.
- **A3 (rejected)** — Separate `admin_user_links` join table. 2 joins per check, no benefit.
- **A4-wholesale (rejected)** — JWT-only role storage. JWT staleness blocks admin revocation.
- **A4-as-cache (rejected with sharper rationale)** — JWT `app_metadata.role` claim caching DB lookup. Rejected: <1 req/s admin traffic, ~30ms/day cumulative cache savings (per-request UX cost is +5–20ms p99, aggregate cache benefit is ~30ms/day at this traffic level — both numbers consistent), 1-hour staleness window during which a demoted admin retains effective access. Implementation cost (signin hook + JWT-claim middleware reader + invalidation rules) does not pay back. **Revisit gate F8**: reopen if admin RPS sustained >5 OR admin count >50.

---

## 2. Pre-Mortem (3 scenarios)

### P1 — Admin link skip causes lockout (HIGH severity, mitigated)

**Scenario:** Operator runs `001_initial_schema.sql` + `002_admin_user_id.sql` but forgets the seed step linking `admin_users` rows to `auth.users` UUIDs. All admin login attempts pass Supabase auth but fail `requireAdmin()` lookup → all admins locked out.

**Mitigation:**
- Idempotent seed `supabase/seed/admin-link.sql` listed in S1 acceptance.
- `requireAdmin()` failure logs `auth_user_id` and matched-by-email `admin_users` row (if any) — see §3.4 observability.
- **Recovery: manual SQL** documented in S7 / R1.

### P2 — Cookie write silently dropped (HIGH severity, mitigated)

**Scenario:** Server Action calls `supabase.auth.signInWithPassword`, succeeds, but cookie `setAll` callback in `src/lib/supabase/server.ts` invoked outside request scope → cookies silently no-op → user appears unauthenticated on next request.

**Mitigation:**
- `signInAction` in `src/lib/auth/actions.ts` is called from a Server Action body (request scope guaranteed).
- After signin, `redirect()` causes a fresh request → middleware reads cookie → confirms session.
- E2E manual smoke (S7) verifies "after submit, dashboard renders without re-login."
- Dev-mode log: `[auth] signin ok email=<email> isAdmin=<bool>` (info).

### P3 — Supabase outage during request (MEDIUM severity, behavior precise per route class)

**Behavior by route class:**
- **Public** (`/`, `/privacy`, `/terms`, `/login`, `/register`, `/admin/login`, `/apply/complete`): Middleware catches `getUser()` exception, treats as no-session, lets request pass through. Pages render normally — they don't call `requireAdmin()` or `requireUser()`.
- **Protected user paths** (`/apply`, `/mypage/**`): Middleware catches `getUser()` exception, redirects to `/login?redirect=<path>`. Login page renders normally.
- **Protected admin paths** (`/admin/**` except `/admin/login`): Middleware redirects to `/admin/login`. Same recovery story.
- **Server Components calling `requireAdmin()`** (e.g. `/admin/orders/[id]/receive/page.tsx`): `requireAdmin()` returns null on Supabase error → caller `redirect('/admin/login')`. Redirect itself does not require Supabase.

**Explicitly NOT in scope:** Custom Korean 5xx page. Next.js default error boundary + browser retry is acceptable for an internal-staff outage path.

Tested in S7: dev test with invalid `NEXT_PUBLIC_SUPABASE_URL` confirms all four route classes behave as documented.

---

## 3. Expanded Test Plan (DELIBERATE)

**Vitest decision: deferred to F3.** Ships `scripts/smoke-auth.mjs` for this PR. Rationale: single PR scope; 4 verifiable string-return code paths reachable via direct `@supabase/supabase-js` calls without DOM. Adding Vitest infra (config, jsdom decision, alias, `next/headers` mocks) is a meaningful side-quest.

### 3.1 Unit-equivalent layer — `scripts/smoke-auth.mjs`

Standalone Node ESM script using `@supabase/supabase-js` (already a project dependency).

**Acceptance:**
- File `scripts/smoke-auth.mjs` exists, ESM, no transpilation.
- Reads `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from `process.env` (loads `.env.local` via `node --env-file=.env.local`).
- **Asserts Supabase returns the expected error codes** for the 4 credential/role paths:
  1. Empty email + password → caller-side guard hits before reaching Supabase (server-side string `"이메일과 비밀번호를 입력해 주세요."`)
  2. Wrong password → `signInWithPassword` returns `{ error: { code: 'invalid_credentials' } }` (Server Action maps to `"이메일 또는 비밀번호가 올바르지 않습니다."`)
  3. Authenticated non-admin attempts admin login → `admin_users.user_id = <uid>` returns no row (Server Action maps to `"관리자 권한이 없는 계정입니다."`)
  4. Admin user attempts user-side login → `admin_users.user_id = <uid>` returns a row (Server Action maps to `"관리자 계정은 /admin/login 에서 로그인해 주세요."`)
- Korean-string presence is asserted by §3.5 `grep -F` tests, NOT by the smoke script. The smoke script validates the **error-code surface** that the Server Actions translate.
- Run command: `node --env-file=.env.local scripts/smoke-auth.mjs`
- Exit 0 on all pass; non-zero on failure with a Korean-aware diff.

### 3.2 Integration layer — `supabase start` local stack

Local Supabase (Docker). `supabase/seed.sql` populates 2 admin rows (one linked, one with `user_id IS NULL`) and 1 normal user. Documented in `docs/qa/auth-smoke.md` as a manual recipe (no test runner today). Recipe asserts each Korean string round-trips end-to-end (form → Server Action → response → render).

### 3.3 E2E layer — manual checklist `docs/qa/auth-smoke.md`

- [ ] User register at `/register` → redirected to `/login?registered=true` (email-confirm OFF) → can sign in
- [ ] User signin at `/login` → redirects to `/apply` or `redirect` query param
- [ ] User signin with admin credentials at `/login` → blocked with `"관리자 계정은 /admin/login 에서 로그인해 주세요."`
- [ ] Admin signin at `/admin/login` with non-admin user → blocked with `"관리자 권한이 없는 계정입니다."`
- [ ] Admin signin at `/admin/login` with linked admin → redirects to `/admin` dashboard
- [ ] Admin signin at `/admin/login` with `admin_users` row whose `user_id IS NULL` → blocked with `"관리자 권한이 없는 계정입니다."` + structured warn log emitted
- [ ] Logout from `/mypage` clears cookie → next `/apply` redirects to `/login`
- [ ] Outage simulation (bad `NEXT_PUBLIC_SUPABASE_URL`) → public pages render, protected pages redirect, no white-screen
- [ ] Korean-string greps from §3.5 pass

### 3.4 Observability (DELIBERATE-mode requirement)

Dev-mode console logs (no telemetry pipeline yet, internal-staff scale):
- `[auth] signin ok email=<email> isAdmin=<bool>` (info)
- `[auth] signin failed code=<code>` (warn)
- `[auth] requireAdmin denied authUserId=<uid> matchedEmail=<email|null>` (warn) — Fix #4 logging; `matchedEmail` is the email pulled from `admin_users` by service-role lookup, `null` if no match
- `[auth] supabase env missing key=<NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY>` (error)

Gated behind `process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === '1'` to avoid leaking emails to production logs.

### 3.5 Korean string presence/absence grep tests

In `docs/qa/auth-smoke.md`, the final manual step. From repo root:

**MUST be present:**
```bash
grep -F "이메일과 비밀번호를 입력해 주세요." src/lib/auth/actions.ts
grep -F "이메일 또는 비밀번호가 올바르지 않습니다." src/lib/auth/actions.ts
grep -F "관리자 계정은 /admin/login 에서 로그인해 주세요." src/lib/auth/actions.ts
grep -F "관리자 권한이 없는 계정입니다." src/lib/auth/actions.ts
grep -F "로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." src/lib/auth/actions.ts
```

**MUST be absent:**
```bash
grep -rF "임시 로그인" src/      # the deleted callout heading
grep -rl "temp-auth" src/         # any temp-auth shim refs
```

Both grep blocks are explicit acceptance criteria for S7.

---

## 4. ADR

### Decision
Replace temp-auth shim with real Supabase Auth using:
- **A1** additive `admin_users.user_id` column (nullable; UNIQUE; FK to `auth.users(id)`)
- **B1** middleware path-gate + Server-Component-side `requireAdmin()` using a service-role Supabase client (`src/lib/supabase/admin.ts`)
- **C2** `supabase.auth.signUp` with `options.data = { name, phone }`, leveraging existing `handle_new_user` trigger
- **D1** big-bang temp-auth removal in one PR

### Drivers
1. Security (admin bypass is catastrophic)
2. Footprint (3 files + 4 import sites)
3. Reversibility (single PR, additive SQL)

### Alternatives considered
- A2 / A3 / A4-wholesale / A4-as-cache — see §1
- B2 (middleware-only) — Server Components don't re-run middleware on streaming → defence-in-depth required
- B3 (Server-Component-only) — middleware is the cheapest layer for path-gate; not running it would mean unauthenticated requests reach every admin Server Component before being denied
- C1 (defer register) — `register/page.tsx:99-100` has a `console.log` stub; leaving it after temp-auth removal is a broken-looking flow
- D2 (gradual feature flag) — parallel-cookie complexity for a 7-file footprint

### Why chosen
Combination minimises destructive SQL, keeps PR reviewable in one pass, exploits existing infrastructure (`handle_new_user` trigger, `@supabase/ssr` clients), preserves existing Server Action pattern.

### Consequences

**Positive:**
- One reviewable PR
- Reversible by `git revert` (additive SQL; no column drop)
- Defence in depth — admin bypass requires both middleware AND `requireAdmin()` to fail
- Re-uses existing `handle_new_user` trigger; no DB-side rework

**Negative / cost:**
- **Per-request DB query cost (latency note):** `requireAdmin()` issues one indexed `admin_users` SELECT per admin-protected request (lookup by `user_id` UNIQUE column → B-tree index seek). Expected impact: **p99 +5–20 ms per admin-protected request** including network round-trip to Supabase pooled connection. Admin traffic is internal staff (<1 req/s peak), absolute cumulative impact negligible.
- **A4-as-cache rebuttal:** Cache layer would save <30 ms/day at this traffic level (5–20ms per-request UX cost vs ~30ms/day aggregate caching benefit — both numbers consistent; per-request cost is paid by user, aggregate benefit is system-wide), introduces 1-hour staleness window during which demoted admin retains effective access. Implementation cost not justified. **DB authoritative because role-revocation must take effect within seconds, not within an hour.** Revisit gate **F8**.
- Service-role key (`SUPABASE_SERVICE_ROLE_KEY`) becomes a required env var for admin path. Documented in S6 + `.env.local.example` updates (S4).
- Korean string surface area grows by 1 new string (5xx fallback) and 0 or 1 new string (registration banner — Recommended #10 decision: OFF for staging this PR).

### Follow-ups (F-series)

| ID | Item | Trigger / when |
|----|------|----------------|
| F1 | Wire admin role-based access control in admin sidebar (per-`AdminRole`) | When admin features ship per-role |
| F2 | Email confirmation toggle in Supabase project settings | When email deliverability is provisioned |
| F3 | Add Vitest + first unit tests | Post-PR, separate infra ticket |
| F4 | Telemetry pipeline for `[auth]` warn/error logs | When ops tooling is provisioned |
| F5 | Password reset / forgot-password flow | Out of scope for this PR |
| F6 | Account deletion / GDPR-equivalent data flows | Out of scope |
| **F7** | **Migration `003_admin_user_id_required.sql` to flip `admin_users.user_id` to NOT NULL** | **When `SELECT COUNT(*) FROM admin_users WHERE user_id IS NULL` returns 0 in production. Tracked obligation.** Note: dev/staging may have unlinked rows persisting; F7 prose should include a workflow note ensuring dev-environment rows are linked or pruned before the migration runs in CI. |
| **F8** | **JWT `app_metadata.role` cache layer** | **If admin RPS sustained >5 OR admin count >50** |
| **F9** | **Self-link on first login (revisit option (b) from R1)** | **If >2 manual SQL recoveries/month** |

---

## 5. Implementation Steps

### S1 — DB migration (additive)

**Files:**
- New: `supabase/migrations/002_admin_user_id.sql`
- New: `supabase/seed/admin-link.sql` (idempotent linker)

**SQL contract (`002_admin_user_id.sql`):**
```sql
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
```

Note: column intentionally **nullable** in this migration to allow incremental linking; F7 ships `003_admin_user_id_required.sql` to flip NOT NULL.

**Seed (`admin-link.sql`) — idempotent:**
```sql
UPDATE admin_users a
   SET user_id = u.id
  FROM auth.users u
 WHERE a.email = u.email
   AND a.user_id IS NULL;
```

**Pre-implementation check:** `SELECT COUNT(*) FROM order_status_logs;` to confirm whether existing rows constrain the `changed_by` UUID convention choice (S2). If 0, unconstrained.

**Acceptance:**
- Migration runs cleanly on fresh DB and existing dev DB
- Seed is idempotent (second invocation no-op)
- No existing FK to `admin_users.id` is broken (`order_status_logs.changed_by` has no FK declaration — `001_initial_schema.sql:102`)

### S2 — `requireAdmin()` and service-role client

**Files:**
- New: `src/lib/supabase/admin.ts` — exports `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY`
- New: `src/lib/auth/require-admin.ts` — exports `requireAdmin()`
- Touch (later in S6): `src/lib/auth/AGENTS.md`

**`src/lib/supabase/admin.ts` contract:**
- Imports `createClient` from `@supabase/supabase-js` (NOT from `@supabase/ssr` — this is a service-role admin client, not request-scoped)
- Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- If either missing: function returns `null` and logs `[auth] supabase env missing key=<which>` (warn). Does NOT throw at module load. **MUST NOT use non-null assertion (`!`) on `process.env.SUPABASE_SERVICE_ROLE_KEY`** — runtime check inside the factory function.
- Module-level guard comment (Korean):
  ```ts
  // 서버 전용 - "use client" 또는 Edge/middleware에서 import 금지 (서비스 롤 키 노출)
  ```

**`requireAdmin()` contract:**
```ts
export type AdminSession = {
  authUserId: string;       // auth.users.id
  adminId: string;          // admin_users.id
  adminRole: AdminRole;     // 'SUPER_ADMIN' | 'STORE_MANAGER' | 'GRADING_MANAGER' | 'CS_AGENT'
  email: string;
  name: string;
};

export async function requireAdmin(): Promise<AdminSession | null>;
```

**Behaviour (ordering matters — null-check between client creation and query):**
1. `createServerClient()` from `src/lib/supabase/server.ts` (anon, request-scoped) → `supabase.auth.getUser()`. If no user, return null.
2. `createAdminClient()` from `src/lib/supabase/admin.ts` (service-role).
3. **If admin client is null** (env missing): log error, return null. **Do this check before any `.from()` query** — calling `.from()` on null would throw `TypeError`.
4. With service-role client, query `admin_users WHERE user_id = <auth.users.id>`. If no row, log warn and return null.
5. If row found, return `AdminSession`.

**`changed_by` UUID convention:** Downstream callers writing `order_status_logs.changed_by` write `adminSession.adminId` (the `admin_users.id`), preserving compatibility with column comment "어드민 ID 또는 시스템". Documented in `src/lib/auth/AGENTS.md` (S6).

**Acceptance:**
- `requireAdmin()` lookup succeeds even under hypothetical RLS policy on `admin_users` denying anon access (service-role bypasses RLS)
- `requireAdmin()` MUST NOT use `createServerClient()` for the `admin_users` lookup — only for the `getUser()` cookie session read
- Return shape exactly matches `AdminSession`
- All denial paths emit structured warn log from §3.4
- Null-check on `createAdminClient()` happens before any `.from()` call

### S3 — Middleware path-gate

**Files:**
- Touch: `src/lib/supabase/middleware.ts`

**Behaviour:**
- Refresh session via `supabase.auth.getUser()` (preserve existing `setAll` cookie pattern verbatim — load-bearing)
- Path-gate (additive):
  - `/apply` and `/mypage` require user → redirect to `/login?redirect=<path>` (already present, keep)
  - `/admin/**` (except `/admin/login`) require user → redirect to `/admin/login`. **Do NOT** call `requireAdmin()` here; middleware only checks "is logged in." DB lookup happens in Server Components via `requireAdmin()`. Middleware runs on every matcher-included request including streaming sub-segments; calling `requireAdmin()` here would 2x DB load.
- Outage handling (P3): if `getUser()` throws, treat as no-session.

**Acceptance:**
- Existing `setAll` cookie-rebuild pattern preserved verbatim
- No new Supabase queries added in middleware (cheap layer stays cheap)
- Outage simulation (§3.3) produces documented redirect behavior

### S4 — Env handling and outage degradation

**Files:**
- Touch: `.env.local.example` — add `SUPABASE_SERVICE_ROLE_KEY=` placeholder + comment
- Touch: `src/lib/supabase/middleware.ts` — env-missing branch for any of three keys
- Touch: `src/lib/supabase/admin.ts` — env-missing branch (covered in S2)

**Env-missing branches:**
- `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing → middleware logs error, treats every request as public passthrough. Protected paths still redirect to login (login page renders without Supabase).
- `SUPABASE_SERVICE_ROLE_KEY` missing → `createAdminClient()` returns null → `requireAdmin()` returns null → admin Server Components redirect to `/admin/login`. NOT silently allow. Log structured error.

**Acceptance:**
- All three keys have explicit branches
- No env-missing branch results in authenticated admin context being granted
- `.env.local.example` updated; `pnpm dev` works with empty values for all three (in dev-fallback mode, all admin routes redirect to login)

### S5 — Server Actions and form pages

**Files:**
- Touch: `src/lib/auth/actions.ts` — preserve Korean strings from inventory; ensure real Supabase calls
- Touch: `src/app/(user)/(auth)/login/page.tsx` — remove "임시 로그인 안내" callout block (around line 79)
- Touch: `src/app/(admin)/admin/login/page.tsx` — remove "임시 로그인 안내" callout block (around line 61)
- Touch: `src/app/(user)/(auth)/register/page.tsx` — replace `console.log` stub at line 100 with real `supabase.auth.signUp` call
- Touch: `src/lib/auth/actions.ts` — add `signUpAction` if not present, plus `signOutAction`

**Server Action invocation pattern:** **KEEP current pattern** (`onSubmit={handleSubmit}` + `useTransition` + manual `signInAction(...)`). Both `<form action={action}>` + `useFormState` and the current pattern are CSRF-safe via Next.js Server Action ID fingerprinting. Refactor has no UX gain.

**Korean string handling:** **KEEP duplicate client-side guards** for empty-email/password (`"이메일과 비밀번호를 입력해 주세요."`) on both login pages. Faster UX feedback; server-side check at `actions.ts:23` remains authoritative. Intentional defence-in-depth.

**Register flow:** Email-confirm **OFF** for staging this PR. Redirect to `/login?registered=true` after successful signUp. F2 captures the toggle.

**5xx fallback string:** `"로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."` — used in `catch` branch of `signInAction` for non-Supabase-typed exceptions. Located in `src/lib/auth/actions.ts`.

**Acceptance:**
- "임시 로그인 안내" callout HEADING removed from BOTH login pages; confirmed by absence-grep
- All five Server-Action-side Korean strings (rows 1–4 + 6 in §7 inventory) live in `src/lib/auth/actions.ts`; confirmed by presence-grep
- Client-side empty-input guards remain on both login pages
- Register page invokes `supabase.auth.signUp(..., { options: { data: { name, phone } } })` and removes `console.log` stub
- All four route-class outage behaviors from P3 / §3.3 work

### S6 — `src/lib/auth/AGENTS.md`

**File:** New `src/lib/auth/AGENTS.md`

**Content (skeleton):**
- "Server-only files: `actions.ts`, `require-admin.ts`. Never import from `"use client"`."
- "`src/lib/supabase/admin.ts` is service-role. Never import from `"use client"`. Never import from middleware/Edge (would leak service-role key to Edge runtime)."
- "`order_status_logs.changed_by` writes `adminSession.adminId` (the `admin_users.id`), not `authUserId`. See S2."
- "Login pages keep client-side empty-input guards intentionally; the server validates again. See §7 inventory row 1."
- "Form invocation pattern: `onSubmit + useTransition`; not `<form action>`. See Recommended #9."
- "Korean strings enumerated in `docs/qa/auth-smoke.md` § Korean string inventory; do not silently rephrase."

**Acceptance:** File exists; references all six conventions above.

### S7 — Smoke + Korean grep + manual checklist

**Files:**
- New: `scripts/smoke-auth.mjs`
- New: `docs/qa/auth-smoke.md`

**`docs/qa/auth-smoke.md` sections:**
1. Setup (`supabase start`, run migrations, seed admins, set `.env.local`)
2. Smoke script: `node --env-file=.env.local scripts/smoke-auth.mjs`
3. E2E checklist (§3.3)
4. Korean string presence/absence greps (§3.5)
5. **Manual SQL recovery procedure (R1):**
   ```sql
   -- Find the auth UUID for an admin email
   SELECT id FROM auth.users WHERE email = '<admin-email>';

   -- Link it
   UPDATE admin_users SET user_id = '<auth-uid>' WHERE email = '<admin-email>';
   ```

**Acceptance:**
- `scripts/smoke-auth.mjs` runs to completion (exit 0) against a freshly seeded local Supabase
- All grep tests in §3.5 pass
- E2E checklist completed by hand at least once before merge

---

## 6. Risk Register

### R1 — Admin link skip causes admin lockout (HIGH; LOW likelihood)

**Mitigation chain:**
1. **Prevention:** `supabase/seed/admin-link.sql` idempotent, listed as required in S1 acceptance
2. **Detection:** Every `requireAdmin()` denial logs `[auth] requireAdmin denied authUserId=<uid> matchedEmail=<email|null>`
3. **Recovery (manual SQL):**
   ```sql
   SELECT id FROM auth.users WHERE email = '<admin-email>';
   UPDATE admin_users SET user_id = '<auth-uid>' WHERE email = '<admin-email>';
   ```
4. **Revisit gate F9:** if >2 manual recoveries/month, reopen as self-link feature

**Why option (a) manual SQL and not (b) self-link:** Self-link has email-collision attack surface (admin email mistyped/reused before link → attacker registering with that email auto-promotes). Self-link branch in `requireAdmin()` would also blur the line between "auth check" and "auth state mutation."

### R2 — Cookie write silently dropped (HIGH; LOW likelihood) → see P2.

### R3 — Supabase outage during request (MEDIUM) → see P3.

### R4 — Service-role key leaked client-side (CATASTROPHIC; LOW likelihood)

**Mitigation:**
- `src/lib/auth/AGENTS.md` (S6) explicitly forbids importing `src/lib/supabase/admin.ts` from `"use client"` files OR middleware/Edge
- Module-level Korean comment in `admin.ts` repeats the warning
- Manual code review at PR time
- Future: ESLint `no-restricted-imports` rule for `"use client"` files (out of scope; consider as F-series)

### R5 — Email confirm setting differs between dev and prod (MEDIUM)

**Mitigation:** Recommended #10 decision (email-confirm OFF for staging this PR) explicit. `docs/qa/auth-smoke.md` documents both register-redirect targets in conditional form. F2 captures the toggle.

### R6 — `order_status_logs.changed_by` provenance breaks if convention silently changed (MEDIUM)

**Mitigation:** S2 acceptance + `src/lib/auth/AGENTS.md` (S6) explicitly state "write `adminSession.adminId`." Pre-implementation check during S1: `SELECT COUNT(*) FROM order_status_logs;` to confirm whether existing rows constrain choice (if 0, unconstrained; if >0, must match historical convention).

---

## 7. Korean String Inventory

| # | String | File:Line(s) | Decision |
|---|--------|--------------|----------|
| 1 | `이메일과 비밀번호를 입력해 주세요.` | `src/lib/auth/actions.ts:23` (server) <br> `src/app/(user)/(auth)/login/page.tsx:35` (client guard) <br> `src/app/(admin)/admin/login/page.tsx:22` (client guard) | **KEEP all three.** Duplicate client-side guards intentional for UX. Server authoritative. |
| 2 | `이메일 또는 비밀번호가 올바르지 않습니다.` | `src/lib/auth/actions.ts:30` | KEEP. Single source. |
| 3 | `관리자 계정은 /admin/login 에서 로그인해 주세요.` | `src/lib/auth/actions.ts:38` | KEEP. Single source. |
| 4 | `관리자 권한이 없는 계정입니다.` | `src/lib/auth/actions.ts:44` | KEEP. Single source. |
| 5 | `임시 로그인 안내` (callout HEADING) | `src/app/(admin)/admin/login/page.tsx:61` <br> `src/app/(user)/(auth)/login/page.tsx:79` | **DELETE BOTH** in S5; no replacement. Verified by absence-grep §3.5. |
| 6 | `로그인 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.` | `src/lib/auth/actions.ts` (NEW, in catch branch of `signInAction`) | **NEW.** 5xx fallback. |
| 7 | `가입 확인 메일을 보내드렸습니다. 메일함을 확인해 주세요.` | `src/app/(user)/(auth)/login/page.tsx` (banner, conditional `?confirm-email=pending`) | **CONDITIONAL.** NOT shipped this PR (email-confirm OFF). F2 will revisit. |

§3.5 codifies presence/absence grep for #1–#6 (#7 conditional, currently NOT shipped).

---

## 8. Decisions on Recommended Fixes

| # | Recommendation | Decision | Rationale |
|---|----------------|----------|-----------|
| 7 | Document path to `user_id NOT NULL` | **ACCEPT** — F7 in ADR follow-ups | Converts silent footgun into tracked obligation |
| 8 | Strengthen "graceful degrade" precision in P3 | **ACCEPT** — P3 specifies behavior per route class | Concrete behavior beats vague phrase |
| 9 | Specify form-action invocation pattern | **KEEP CURRENT** — `onSubmit + useTransition` | Both CSRF-safe; refactor has no UX gain |
| 10 | Concretize email-confirm-ON path | **EMAIL-CONFIRM OFF** for staging this PR | Email deliverability not provisioned; F2 will toggle |

---

## 9. Executor Handoff Notes (from Critic round-2 verdict)

The Critic approved with three documentation notes the executor applies during implementation:

1. **Fix #4 prose precision (Architect's blocking concern, downgraded by Critic):** when implementing, `scripts/smoke-auth.mjs` validates **Supabase English error codes** for the credential paths; `§3.5 grep -F` tests validate **Korean strings exist verbatim** at the documented file:line locations; the role-denial path is exercised manually until F3 Vitest lands. Together the artifacts cover code-path + string-presence; the Korean strings live one layer above what supabase-js can reach (in Server Actions translating Supabase errors).

2. **S2 module-guard comment (Architect polish #1):** `src/lib/supabase/admin.ts` header comment must forbid both `"use client"` AND middleware/Edge runtime imports. Suggested verbatim:
   ```ts
   // 서버 전용 - "use client" 또는 Edge/middleware에서 import 금지 (서비스 롤 키 노출)
   ```

3. **S4 null-check ordering (Architect polish #2):** in `requireAdmin()`, the null-check on `createAdminClient()` happens **between client creation and the `admin_users` query**, never after. Reflected in S2 step 3.

Architect polish items #3 (F7 dev-workflow note) and #4 (ADR latency/cache reconciliation explicit) are already substantively present in this plan (F7 includes the workflow note inline in the F-series table, ADR §4 contains both numbers); only light copy-edit during implementation.

---

## 10. Self-check vs. blocking fixes

| Round | Fix | Resolution |
|---|---|---|
| R1 / Architect #1 | service-role client | S2 + S4 + R4 + S6 ✓ |
| R1 / Architect #2 | ADR latency + A4 cache rebuttal | §4 ADR Consequences ✓ |
| R1 / Architect #3 | P2 string inventory | §7 + §3.5 + S5 ✓ |
| R1 / Architect #4 | Vitest decision | §3.1 + F3 ✓ |
| R1 / Critic #4 | R1 concrete recovery | §6 R1 + S7 + §3.4 ✓ |
| R1 / Critic #6 | `requireAdmin()` return shape + `changed_by` | S2 + S6 + R6 ✓ |
| R2 / Architect blocking | Fix #4 prose precision | §9 executor note ✓ |

All 4 R1-Architect-mandatory + 6 R1-Critic-blocking + 1 R2-Architect-blocking resolved. All 7 R1 recommended + 4 R2 polish either accepted (recommended) or attached as executor notes (R2 polish).

---

**End of plan.** Status: APPROVED. Ready for execution via `team`, `ralph`, or direct implementation.
