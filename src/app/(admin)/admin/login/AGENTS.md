<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# login

## Purpose
Admin sign-in page at `/admin/login`. Posts credentials to `signInAction` with `expectedRole: "admin"`. The middleware lets this route through unauthenticated; the parent admin layout (`AdminShell`) hides the sidebar so the page renders full-bleed.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `"use client"`. Email/password form with local `useState` + `useTransition`. Calls `signInAction({ email, password, expectedRole: "admin" })` and routes to the returned `redirectTo` on success. Korean error messages from the server action are rendered inline |

## For AI Agents

### Working In This Directory
- This is the only `/admin/**` URL the middleware does not gate. `enforceAccess` in `src/lib/supabase/middleware.ts` excludes `/admin/login` explicitly — preserve that exception if you refactor.
- When Supabase Auth replaces the temp shim: keep the form shape but swap `signInAction` for the Supabase `signInWithPassword` flow. The `expectedRole` parameter goes away (Supabase claims-based instead).
- Pre-seeded admin credential is `host1@example.com / 1234` (see `src/lib/auth/temp-auth.ts:TEMP_ACCOUNTS`).

## Dependencies

### Internal
- `@/lib/auth/actions` (`signInAction`).
- `@/components/ui/{button,input,label}`.

<!-- MANUAL: -->
