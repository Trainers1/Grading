<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# app

## Purpose
Next.js App Router root. Hosts the global root layout, global CSS, and three top-level branches: the admin console route group `(admin)`, the customer-facing site route group `(user)`, and the (currently empty) `api/` route handlers directory. Each route group brings its own layout/shell.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Root `<html lang="ko">` wrapper. Sets `<title>`/`<description>` metadata and imports `globals.css`. Do not insert site chrome here — chrome belongs to the `(user)` and `(admin)` group layouts |
| `globals.css` | Tailwind v4 import + `@theme` design-token block (brand colors, status colors, font, breakpoints, radii). All other styling derives from these tokens |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `(admin)/` | Admin console route group, wrapped by `AdminShell`/`AdminSidebar` (see `(admin)/AGENTS.md`) |
| `(user)/` | Customer-facing site route group, wrapped by `UserHeader`/`UserFooter` (see `(user)/AGENTS.md`) |
| `api/` | Route handler placeholders for `auth/`, `orders/`, `payments/` — currently empty (see `api/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- The root layout is intentionally minimal. Do not add headers, footers, or providers that should only apply to a route group — push them into `(admin)/admin/layout.tsx` or `(user)/layout.tsx`.
- Adding new top-level pages: decide whether they belong under `(user)` (public/customer-facing) or `(admin)` (auth-gated console). The middleware (`src/lib/supabase/middleware.ts`) only protects paths starting with `/apply`, `/mypage`, or `/admin/**`. New protected paths must use one of those prefixes or be added to the matcher logic.
- Tailwind tokens live in `globals.css`. New design tokens go in the `@theme` block; do not introduce a `tailwind.config.*` file (Tailwind v4 is config-via-CSS).

### Common Patterns
- Route groups: `(group)` directories scope a `layout.tsx` without affecting URL paths.
- Dynamic segments: `[id]` for parameterized routes (e.g., `mypage/orders/[id]`).
- Korean is the default language attribute (`<html lang="ko">`).

## Dependencies

### Internal
- `@/components/admin/admin-shell` and `@/components/user/{user-header,user-footer}` provide the group-level chrome.

<!-- MANUAL: -->
