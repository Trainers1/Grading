<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# overcharges

## Purpose
Overcharge management at `/admin/overcharges` — surfaces orders where the grading company's actual fee exceeded the prepaid estimate. Splits into pending vs. paid groups and shows the total pending amount admins still need to collect.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Async server component (`force-dynamic`). Fetches orders via `getAllOrdersForAdmin` (`@/lib/orders/queries`), filters for `overchargeAmount > 0`, then partitions by `paymentStatus === "OVERCHARGE_PENDING"` vs `"OVERCHARGE_PAID"`. Sums pending amounts. Uses `PAYMENT_STATUS_LABELS` for badges |

## For AI Agents

### Working In This Directory
- The 4 payment statuses involved here (`OVERCHARGE_PENDING`, `OVERCHARGE_PAID`, plus the base `PAID`/`REFUNDED`) are part of the SQL CHECK constraint on `orders.payment_status`. Don't introduce ad-hoc payment states here.
- The customer-side overcharge payment flow lives at `src/app/(user)/mypage/orders/[id]/overcharge/`. Any admin-side action that issues an overcharge invoice should keep that flow in mind.

## Dependencies

### Internal
- `@/lib/orders/queries` (`getAllOrdersForAdmin`).
- `@/constants/grading` (`PAYMENT_STATUS_LABELS`).

<!-- MANUAL: -->
