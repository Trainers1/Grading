<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# orders

## Purpose
Order management — list view with filters (status, grading company, free-text search), the per-order detail page, and the card-receive flow.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Order list. Reads `searchParams` (`status`, `company`, `q`) as a `Promise` (Next 16 async params). Filters `MOCK_ORDERS` and renders rows with status/payment/grading-company badges. Uses `ORDER_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`, `GRADING_COMPANIES` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `[id]/` | Per-order detail page + receive flow (see `[id]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Filter state lives in URL search params, not React state. Adding a new filter means extending the `searchParams` shape and updating the filter UI to push to the URL.
- Status filter is a free-text query against the 14-value `OrderStatus` set; double-check filter buttons map to the **internal** status values (not the user-facing labels).
- When wiring Supabase, push filter conditions into the query (`.eq("order_status", ...)`, `.ilike("name", q)`) rather than fetching all rows and filtering in memory.

## Dependencies

### Internal
- `@/constants/mock-data` (`MOCK_ORDERS`).
- `@/constants/grading` (label maps + `GRADING_COMPANIES`).
- `@/types` (`OrderStatus`, `GradingCompany`).

<!-- MANUAL: -->
