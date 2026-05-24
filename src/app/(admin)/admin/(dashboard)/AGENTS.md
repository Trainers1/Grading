<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# (dashboard)

## Purpose
Route group that backs the `/admin` index URL. Renders the admin dashboard — KPI cards (total revenue from `prepaidAmount + overchargeAmount`, pending delivery count, in-grading count, ready-for-pickup count), recent batches preview, and recent users.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Async server component (`force-dynamic`). Fetches orders/profiles/batches via `@/lib/orders/queries` (`getAllOrdersForAdmin`, `getAllProfilesForAdmin`, `getAllBatchesForAdmin`) and aggregates KPIs. Uses `ORDER_STATUS_LABELS` for status display |

## For AI Agents

### Working In This Directory
- The parenthesized name `(dashboard)` is a route-group directory: it does not appear in URLs. The page resolves to `/admin`.
- KPI computations iterate over the fetched arrays in memory. A future optimization is aggregated queries (`select count(*)` filtered by status) instead of pulling all rows.
- Currency uses `formatCurrency` (₩, ko-KR locale). Reuse a shared formatter once helper code consolidates; for now duplicate locally per page is the established pattern.

## Dependencies

### Internal
- `@/lib/orders/queries` (`getAllOrdersForAdmin`, `getAllProfilesForAdmin`, `getAllBatchesForAdmin`).
- `@/constants/grading` (`ORDER_STATUS_LABELS`).

<!-- MANUAL: -->
