<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# [id]

## Purpose
Customer-side order detail at `/mypage/orders/[id]`. Renders the 7-step `OrderStatusTracker`, payment summary, card list (with grade results when available), and inline controls for: changing pickup method, opting in/out of "등급 결과 미리보기" (spoiler preference), paying for delivery shipping when applicable, and cancelling the order before it leaves the country.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `"use client"`. `params: Promise<{ id: string }>` is unwrapped via React `use()`. Defines `SHIPPING_FEE = 3000` (택배비) and a `NON_CANCELLABLE` list — once `order.orderStatus` enters `DISTRIBUTOR_SHIPPED` or later, cancellation is locked. DENY → ALLOW transition for spoiler preference shows a `window.confirm` prompt (added 2026-04-21) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `overcharge/` | Overcharge payment subroute at `/mypage/orders/[id]/overcharge` (see `overcharge/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Cancellation rules: the `NON_CANCELLABLE` array is the **single source** for the customer-cancel gate. If you add or rename a status that is mid-pipeline, decide whether it's still cancellable and update this list — admins still can cancel via the admin console regardless.
- `SHIPPING_FEE = 3000` is currently a constant in this file. When promotions/regional pricing land, move it to `@/constants/grading.ts` next to `PHOTO_UPLOAD`.
- Pickup-method change UI was scoped per status: only customers in pre-shipment statuses should be allowed to switch `STORE_PICKUP ↔ DELIVERY`. After the order has been distributed-shipped, freeze the field.
- Spoiler preference flips: DENY → ALLOW must show the warning confirm (the customer is committing to seeing the result early). ALLOW → DENY does not need confirmation. Preserve this asymmetry.
- The 결제 button block for shipping fees only shows when `pickupMethod === "DELIVERY"` AND `orderStatus === "TRAINERS_ARRIVED"` (per the 2026-04-21 design change). Keep that gating tight.

## Dependencies

### Internal
- `@/components/user/order-status-tracker`.
- `@/components/ui/{button,radio-group,input,label}`.
- `@/constants/grading` (`ORDER_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`).
- `@/constants/mock-data` (`MOCK_ORDERS`, `MOCK_CARDS`).
- `@/types` (`OrderStatus`, `PickupMethod`, `SpoilerPreference`).

<!-- MANUAL: -->
