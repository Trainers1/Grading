<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# supabase

## Purpose
Supabase project configuration and SQL migrations. The app's Postgres schema (profiles, admin_users, orders, cards, payments, batches, etc.) lives entirely under `migrations/`. There is currently no `config.toml` or local-dev container setup checked in — Supabase is consumed as a hosted project via the env vars in `.env.local.example`.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `migrations/` | SQL migrations applied to the hosted Supabase Postgres instance (see `migrations/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- New tables, columns, enum widenings, and triggers go in a new numbered migration file. Do **not** edit `001_initial_schema.sql` to evolve the schema — append a new migration.
- Postgres uses `snake_case`. The TypeScript mirrors in `src/types/` use `camelCase` and conversion happens at the data-access boundary.

## Dependencies

### Internal
- `src/types/` and `src/constants/grading.ts` mirror the SQL enums (order_status, payment_status, grading_company). Schema changes here require coordinated edits to those files.

<!-- MANUAL: -->
