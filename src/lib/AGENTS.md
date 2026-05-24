<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# lib

## Purpose
Library code — non-UI helpers and clients. Hosts the three Supabase client variants required by `@supabase/ssr`, the temporary hardcoded auth shim, server actions for sign-in/sign-out, and small utilities like `cn()`.

## Key Files

| File | Description |
|------|-------------|
| `utils.ts` | `cn(...inputs)` — wraps `clsx` + `tailwind-merge`. Use everywhere Tailwind classes are composed conditionally |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `auth/` | Temporary in-memory auth (cookie-based) and the matching server actions, until Supabase Auth is wired (see `auth/AGENTS.md`) |
| `supabase/` | Three Supabase client constructors — Browser, Server Component/Action, and Middleware variants (see `supabase/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Anything imported by both client and server code must avoid `next/headers`, `next/server`, and Node-only APIs at the module level. Server-only modules should be safe — server actions live in `auth/actions.ts` and Server Component clients live in `supabase/server.ts`.
- New domain-specific helpers (e.g. payment integration with Toss, Kakao AlimTalk dispatch) should land in a new `lib/<feature>/` folder rather than getting dumped here at the root.

## Dependencies

### External
- `@supabase/ssr`, `@supabase/supabase-js`
- `clsx`, `tailwind-merge`

<!-- MANUAL: -->
