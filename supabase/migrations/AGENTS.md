<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# migrations

## Purpose
Forward-only SQL migrations applied to the hosted Supabase Postgres instance. Tables are namespaced under the default `public` schema and reference `auth.users` via the Supabase-managed schema.

## Key Files

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Full initial schema. Defines `profiles`, `admin_users`, `grading_services`, `orders` (PK is `TEXT` `YYYYMMDD-순번`), `cards` (UUID), `order_status_logs`, `payments`, `batches`, `batch_orders`. Also creates indexes (`user_id`, `order_status`, `payment_status`, `created_at`, `cards.order_id`, `payments.order_id`), an `update_updated_at()` trigger function applied to profiles/orders/cards/payments, and a `handle_new_user()` trigger that mirrors `auth.users` into `profiles` on signup |

## For AI Agents

### Working In This Directory
- **Forward-only.** Add a new file (`002_*.sql`, `003_*.sql`, ...) — do not edit `001_initial_schema.sql` to evolve the schema. Down-migrations are not maintained.
- File naming: `NNN_short_description.sql` (zero-padded, snake_case). Use `IF NOT EXISTS` / `IF EXISTS` so re-runs are idempotent.
- **Enum invariants.** When adding/removing values in `orders.order_status` or `orders.payment_status` CHECK constraints, also update the matching TS unions in `src/types/order.ts` and the label/step maps in `src/constants/grading.ts`. The CHECK constraint, the TS union, the labels map, and the user-facing 7-step stepper must stay in sync.
- **Grading-company invariant.** The 4-value list `('PSA','BGS','CGC','BRG')` appears in the `orders` and `grading_services` CHECK constraints, in the `GradingCompany` TS union, and in `GRADING_COMPANIES` metadata.
- Be careful with foreign-key cascade choices. Existing pattern: `cards.order_id REFERENCES orders(id) ON DELETE CASCADE` and `order_status_logs.order_id ON DELETE CASCADE`, but `payments.order_id` and `batch_orders.order_id` deliberately omit cascade.
- The `handle_new_user()` trigger requires `SECURITY DEFINER` because it inserts on behalf of the new auth user — preserve that when re-running.

### Common Patterns
- All timestamp columns use `TIMESTAMPTZ DEFAULT NOW()`.
- Boolean flags default explicitly (`DEFAULT TRUE` / `FALSE`).
- Indexes are named `idx_<table>_<column>`.

## Dependencies

### Internal
- `src/types/order.ts`, `src/types/user.ts` mirror these tables in TypeScript.
- `src/constants/grading.ts` mirrors the enum value sets.

<!-- MANUAL: -->
