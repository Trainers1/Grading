<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# admin

## Purpose
Layout chrome for the admin console. Renders the persistent sidebar plus a `<main>` content area, and conditionally hides itself on `/admin/login` so the login page can render full-bleed.

## Key Files

| File | Description |
|------|-------------|
| `admin-shell.tsx` | `"use client"` wrapper that hides the sidebar shell when `usePathname() === "/admin/login"`. Receives `adminEmail` from the server-side admin layout (`src/app/(admin)/admin/layout.tsx`) which reads it from `getTempSession()` |
| `admin-sidebar.tsx` | `"use client"` sidebar with admin navigation, current admin email display, and sign-out form (calls `signOutAdminAction` from `@/lib/auth/actions`) |

## For AI Agents

### Working In This Directory
- The admin layout is server-rendered (`src/app/(admin)/admin/layout.tsx`) and reads the temp session, then passes the email through `AdminShell` to `AdminSidebar`. When Supabase Auth lands, swap `getTempSession()` for the Supabase server client read.
- New admin nav links: add to `admin-sidebar.tsx`. Match the route paths defined under `src/app/(admin)/admin/`.
- The shell pattern (full-bleed login, sidebar everywhere else) is checked by exact path equality on `/admin/login`. If you add other auth pages (password reset, etc.) extend the `hideShell` condition.

## Dependencies

### Internal
- `@/lib/auth/temp-auth` (`getTempSession` — read by the parent layout, not the sidebar directly).
- `@/lib/auth/actions` (`signOutAdminAction` — called from the sign-out form).
- `next/navigation` (`usePathname`).

<!-- MANUAL: -->
