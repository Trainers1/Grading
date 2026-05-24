<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# mypage

## Purpose
Customer-side order list and account hub at `/mypage`. Renders a 5-tab filter (전체 / 진행중 / 수령 가능 / 완료 / 결제필요) over `MOCK_ORDERS` and links to per-order detail and to profile management.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Async server component. Fetches the user's orders via `getMyOrders` and renders `MyOrdersList`. |
| `_components/my-orders-list.tsx` | `"use client"`. Filter tabs as a `FilterTab` union (`all \| in_progress \| pickup_ready \| completed \| payment_needed`). The `payment_needed` tab matches both `orderStatus === "PAYMENT_PENDING"` (initial unpaid orders) and `paymentStatus === "OVERCHARGE_PENDING"` (additional charges). The "결제필요" tab uses the `error` accent so it draws attention |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `orders/` | Per-order detail and overcharge subroute (see `orders/AGENTS.md`) |
| `profile/` | Profile management (see `profile/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- The 5-tab filter logic is the **single place** that defines what "수령 가능" / "진행중" mean for the customer view. The classification differs from `ORDER_STATUS_STEPS` — for example, `READY_FOR_PICKUP` (which surfaces as "트레이너스 도착" via labels) is its own filter tab here. If you change either, sanity-check that the filter buckets stay coherent with the customer-visible labels.
- Order data comes from `getMyOrders` (`@/lib/orders/queries`, anon client + RLS, filtered by `user_id = auth.uid()`). The `page.tsx` RSC fetches and passes the list to the `MyOrdersList` client component which owns the filter tabs.
- The badge for `READY_FOR_PICKUP` was changed to "트레이너스 도착" with green styling on 2026-04-21 — preserve that visual hierarchy when restyling.

## Dependencies

### Internal
- `@/lib/orders/queries` (`getMyOrders`).
- `@/constants/grading` (`ORDER_STATUS_LABELS`).
- `@/lib/utils` (`cn`).

<!-- MANUAL: -->
