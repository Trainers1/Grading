<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# (admin)

## Purpose
Route group that scopes the admin console layout (`AdminShell` + `AdminSidebar`) without affecting URL paths. All admin pages live at `/admin/**`. The route group exists purely to attach a layout to the admin subtree.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `admin/` | The actual `/admin/**` URL tree (see `admin/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- The parenthesized name `(admin)` makes this a route group: it does not appear in URLs.
- New admin features go inside `admin/`. Adding a new top-level admin section means creating `admin/<section>/page.tsx` and adding a sidebar nav entry in `src/components/admin/admin-sidebar.tsx`.

<!-- MANUAL: -->
