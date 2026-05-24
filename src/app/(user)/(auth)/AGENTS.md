<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# (auth)

## Purpose
Route group that scopes customer-facing authentication pages (`/login`, `/register`). The route group adds no URL segment; it exists so future shared layout/widgets (e.g. an auth-only minimal header) can be attached here without touching the parent `(user)` layout.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `login/` | Customer email/password sign-in (see `login/AGENTS.md`) |
| `register/` | Email-based signup with mandatory terms/privacy + optional marketing consent (see `register/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- These pages currently still render with the parent `(user)` layout (full header + footer). If you need a chrome-less auth view, add an `(auth)/layout.tsx` here that renders only `{children}` — the route group makes that possible without changing URLs.
- The customer login flow uses `signInAction` with `expectedRole: "customer"`. The admin login lives at `/admin/login` — they share the action and the rejection messages already explain the role mismatch in Korean.

<!-- MANUAL: -->
