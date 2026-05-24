<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# supabase

## Purpose
The three Supabase client constructors required by `@supabase/ssr`. Each surface uses different cookie plumbing — using the wrong one is the most common bug class with `@supabase/ssr`, so each file has a single, narrow purpose.

## Key Files

| File | Description |
|------|-------------|
| `client.ts` | `createClient()` → `createBrowserClient`. Use **only** in `"use client"` Client Components |
| `server.ts` | `async createClient()` → `createServerClient` with `next/headers` cookies. Use in Server Components, Route Handlers, and Server Actions. The `setAll` callback wraps `cookieStore.set` in a `try/catch` because Server Components cannot mutate cookies — keep that swallow |
| `middleware.ts` | `updateSession(request)` runs in Edge middleware. It first checks the `temp-auth` cookie (current dev shim) and falls back to the Supabase session. The `setAll` callback rebuilds `supabaseResponse` from `NextResponse.next({ request })` after re-applying cookies — preserve that pattern, the response shadowing is load-bearing for cookie propagation. `enforceAccess` gates `/apply` and `/mypage` (any logged-in user) and `/admin/**` (admin role only). Degrades gracefully when `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing |

## For AI Agents

### Working In This Directory
- Do not consolidate the three files. Each is required by a different Next runtime context.
- The middleware module is the **only** place that should import from both `@/lib/auth/temp-auth` and `@supabase/ssr`. The temp-auth fast path will be removed when Supabase Auth replaces the shim — the `TODO: Supabase Auth 연동 후 이 분기 제거` comment marks the deletion point.
- `protectedPaths` are encoded inline in `enforceAccess` as prefix checks against `pathname.startsWith("/apply")`, `pathname.startsWith("/mypage")`, `pathname.startsWith("/admin")`. New protected routes must either nest under one of these prefixes or extend that function.
- For Edge-runtime safety, never import Node-only modules into `middleware.ts`.

### Common Patterns
- All three clients read `process.env.NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Service-role keys are not used here and must never reach client code.

## Dependencies

### Internal
- `middleware.ts` imports `TEMP_AUTH_COOKIE_NAME` and `TempSession` from `@/lib/auth/temp-auth`.

### External
- `@supabase/ssr` (`createBrowserClient`, `createServerClient`).

<!-- MANUAL: -->
