<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# payment

## Purpose
Toss Payments handoff at `/apply/payment`. Shows a summary of the order (grading company, service level, card count, unit price, total) and a "결제하기" button that should kick off the Toss SDK widget.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `"use client"`. Currently uses a hardcoded `orderSummary` object and a stubbed `handlePayment` that simulates a 1.5s delay then redirects to `/apply/complete?orderId=...`. Comments outline the real flow: (1) POST `/api/orders` to create the order row, (2) Toss widget for the payment, (3) POST `/api/payments/confirm` server-side validation |

## For AI Agents

### Working In This Directory
- The implementation is intentionally a stub — wiring real Toss is the next milestone. Do not delete the TODO comments in `handlePayment` until the real flow lands; they're the spec.
- Toss client key is `NEXT_PUBLIC_TOSS_CLIENT_KEY`; the secret key (`TOSS_SECRET_KEY`) must stay server-side. The confirm step (server validation against Toss) MUST happen in a Route Handler under `src/app/api/payments/`, not here.
- The order ID convention is `YYYYMMDD-순번`. The hardcoded sample uses `20260329-001` — replace with a real generated id when wiring server-side order creation.
- This page does not currently know about the apply form data; the real flow needs to either pass the form payload via Server Action / a draft order row in the DB, not via URL params.

## Dependencies

### Internal
- `@/components/ui/button`.

### External (planned)
- Toss Payments JS SDK.

<!-- MANUAL: -->
