<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# overcharge

## Purpose
Customer-facing overcharge payment screen at `/mypage/orders/[id]/overcharge`. Reached when the actual grading fee exceeds the prepaid amount and the admin has flagged the order for `OVERCHARGE_PENDING`.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Async server component (`force-dynamic`). Awaits `params`, fetches the order via `getMyOrderById` (`@/lib/orders/queries`, anon client + RLS). If not found or no `overchargeAmount`, renders a "결제 대상이 아닙니다" notice with a back link instead of 404'ing; otherwise passes `order` to `OverchargeClient` |
| `_components/overcharge-client.tsx` | `"use client"`. Receives `order` as a prop, owns the payment UI, `handlePayment`, `useState`/`useRouter`. Toss Payments wiring is still a stubbed TODO |

## For AI Agents

### Working In This Directory
- Successful overcharge payment must transition `payment_status` from `OVERCHARGE_PENDING` to `OVERCHARGE_PAID`. The admin overcharges page (`/admin/overcharges`) reflects that change.
- The customer should not be able to pay an overcharge for an order they don't own. RLS plus middleware prefix gate (`/mypage` requires login) cover this; do not add ad-hoc `userId` checks here that could mask an RLS hole.
- Toss flow is shared with `/apply/payment` — when the real implementation lands, factor a `<TossCheckoutButton orderId={...} amount={...} type="OVERCHARGE">` rather than duplicating SDK wiring.

## Dependencies

### Internal
- `@/components/ui/button` (`Button`, `buttonVariants`).
- `@/lib/orders/queries` (`getMyOrderById`).

<!-- MANUAL: -->
