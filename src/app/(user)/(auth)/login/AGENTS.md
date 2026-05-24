<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# login

## Purpose
Customer sign-in page at `/login`. Calls `signInAction` with `expectedRole: "customer"`. Reads `?redirect=<path>` to honor the middleware-supplied return URL after a protected page bounced through here, and `?registered` to show a "registration succeeded — please sign in" notice.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `"use client"`. Wraps the form in `<Suspense>` because `useSearchParams()` requires it under App Router. Inner `LoginForm` reads `redirect` and `registered`, manages local form state with `useState` + `useTransition`, and routes to the returned `redirectTo` on success |

## For AI Agents

### Working In This Directory
- The `<Suspense>` wrapper is mandatory for `useSearchParams()` in this layout. If a refactor inlines the form, keep the suspense boundary.
- Pre-seeded customer credential is `customer1@example.com / 1234` (see `src/lib/auth/temp-auth.ts:TEMP_ACCOUNTS`).
- When Supabase Auth replaces `signInAction`, the `redirect` and `registered` params should remain — they are part of the middleware contract (`/login?redirect=<path>` is set by `enforceAccess`).

## Dependencies

### Internal
- `@/lib/auth/actions` (`signInAction`).
- `@/components/ui/{button,input,label}`.

<!-- MANUAL: -->
