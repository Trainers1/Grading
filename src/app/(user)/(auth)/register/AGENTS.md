<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# register

## Purpose
Customer signup page at `/register`. Email/password registration with name, phone, and the standard 3-checkbox consent block (terms + privacy required, marketing optional, plus an "all" master checkbox).

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `"use client"`. Local form state in a single `useState` object. Validation is client-side only at the moment (the backend signup wiring is not implemented yet) |

## For AI Agents

### Working In This Directory
- The `agreeAll` checkbox is master-controls — toggling it must mirror to `agreeTerms` / `agreePrivacy` / `agreeMarketing`. Conversely, when any of those toggles, `agreeAll` should re-derive. Preserve that two-way binding when refactoring.
- On real-backend wiring: `terms` + `privacy` are mandatory before submit. `marketing` controls `profiles.notification_enabled` (default true if accepted, false otherwise) — that column already exists in `001_initial_schema.sql`.
- Phone format follows `010-XXXX-XXXX`. The schema does not enforce format — keep validation here.
- After successful signup the page should route to `/login?registered=1` so the login screen shows the success notice the form already supports.

## Dependencies

### Internal
- `@/components/ui/{button,input,label,checkbox}`.

<!-- MANUAL: -->
