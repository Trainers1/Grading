<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# admin

## Purpose
The `/admin/**` URL tree — the staff-facing admin console. The shared layout (sidebar + main area) is provided by `layout.tsx`, which reads the temp-auth session and forwards the admin email into `AdminShell`. All non-login pages are protected by the root middleware, which redirects unauthenticated or non-admin requests to `/admin/login`.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Server component. Calls `getTempSession()` from `@/lib/auth/temp-auth`, derives `adminEmail` (only when `session.role === "admin"`), and renders `<AdminShell adminEmail={...}>{children}</AdminShell>`. The shell hides itself on `/admin/login` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `(dashboard)/` | The `/admin` index page — KPI cards + recent activity (see `(dashboard)/AGENTS.md`) |
| `orders/` | Order list, detail, and receive flow (see `orders/AGENTS.md`) |
| `batches/` | Monthly batch dispatch view (see `batches/AGENTS.md`) |
| `grading/` | Grade-result entry view across all in-flight cards (see `grading/AGENTS.md`) |
| `overcharges/` | Overcharge management — pending vs paid (see `overcharges/AGENTS.md`) |
| `users/` | Customer list with order counts (see `users/AGENTS.md`) |
| `settings/` | Service catalog, admin users, and general settings (see `settings/AGENTS.md`) |
| `login/` | Admin login page (see `login/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Adding a new admin section: create `<section>/page.tsx`, add a sidebar entry in `src/components/admin/admin-sidebar.tsx`, and confirm the path is gated correctly by the `/admin` middleware prefix (it is, automatically — but don't move admin pages outside `/admin/**`).
- Most admin pages now read real Supabase data via `@/lib/orders/queries` (dashboard, orders, overcharges, users, receive). `batches` and `settings` still consume `@/constants/mock-admin-data`. When wiring those to real queries, **replace** the mock import; do not leave both.
- Admin pages are server components by default. Switch to `"use client"` only for forms/interactivity (the login page is the existing client example).
- The `(dashboard)` route group makes `/admin` (no trailing segment) hit that page without affecting URLs.

## Dependencies

### Internal
- `@/lib/auth/temp-auth` (`getTempSession`).
- `@/components/admin/admin-shell`.

<!-- MANUAL: -->
