<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# settings

## Purpose
Admin settings at `/admin/settings`. Combines three concerns: (1) per-grading-company service catalog (Economy / Regular / Express prices, etc.), (2) admin staff management (4 roles: SUPER_ADMIN, STORE_MANAGER, GRADING_MANAGER, CS_AGENT), and (3) general site-wide settings.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server component. Local `ROLE_LABELS` maps `AdminRole` to Korean names. Local `SERVICE_PRICES` mirrors what will eventually live in the `grading_services` table; backed today by `GRADING_COMPANIES` for company metadata and `MOCK_ADMIN_USERS` for the staff list |

## For AI Agents

### Working In This Directory
- `SERVICE_PRICES` is currently inlined in this page. The eventual home is the `grading_services` table (see `supabase/migrations/001_initial_schema.sql`) — when wiring real data, move these prices into a Supabase fetch and remove the inline map.
- Admin staff CRUD must enforce role caps: only `SUPER_ADMIN` should be allowed to create or change other admin roles. The middleware role check is binary (admin / not admin); fine-grained role-based authz needs to happen in the Server Action layer.
- The 4-value `AdminRole` union is locked by the SQL CHECK on `admin_users.role`. Adding a role requires the migration + TS-union sync covered in `src/types/AGENTS.md`.

## Dependencies

### Internal
- `@/constants/grading` (`GRADING_COMPANIES`).
- `@/constants/mock-admin-data` (`MOCK_ADMIN_USERS`).

<!-- MANUAL: -->
