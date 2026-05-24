<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# batches

## Purpose
Monthly batch dispatch view at `/admin/batches`. Groups `MOCK_BATCHES` by `month` (YYYY-MM) and renders status/tracking/receipt info per batch. Backed by the `batches` and `batch_orders` tables once Supabase wiring lands.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server component. Groups batches by month in descending order, renders a colored status badge using a local `STATUS_BADGE` map keyed by `PREPARING \| SHIPPED \| RECEIVED \| COMPLETED`. Imports `BATCH_STATUS_LABELS` from `@/constants/mock-admin-data` |

## For AI Agents

### Working In This Directory
- The `batches.status` SQL CHECK is `('PREPARING','SHIPPED','COMPLETED')` — the page also renders a `RECEIVED` badge that does not exist in the schema. If you wire real data, either add `RECEIVED` to the CHECK constraint via a new migration or drop the unused badge style.
- A batch's "month" lives in the `batch_month` column (TEXT, `YYYY-MM`) — not derived from `created_at`.

## Dependencies

### Internal
- `@/constants/mock-admin-data` (`MOCK_BATCHES`, `BATCH_STATUS_LABELS`).

<!-- MANUAL: -->
