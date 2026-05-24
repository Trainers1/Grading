<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# [id]

## Purpose
Per-order detail page at `/admin/orders/[id]`. Shows order metadata, customer info, attached cards, payment summary, and links to the card-receive flow. The route segment `[id]` matches the human-readable order PK (`YYYYMMDD-순번`), not a UUID.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `async` server component. `params` is a `Promise<{ id: string }>` (Next 16 async params). Looks up the order in `MOCK_ORDERS`, calls `notFound()` if missing, and renders detail blocks plus card list from `MOCK_CARDS` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `receive/` | "카드 수령 처리" flow for marking the physical card as received (see `receive/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `params` must be `await`ed — Next 16 changed this to a Promise. Don't regress to synchronous destructure.
- The order PK is a string (`YYYYMMDD-순번`), so `id` arrives as that exact string. Don't coerce to UUID parsing.
- Total amount = `prepaidAmount + (overchargeAmount ?? 0)`. The `??` (not `||`) matters — `0` is a valid overcharge amount and shouldn't fall through.

## Dependencies

### Internal
- `@/constants/mock-data` (`MOCK_ORDERS`, `MOCK_CARDS`).
- `@/constants/grading` (`ORDER_STATUS_LABELS`, `PAYMENT_STATUS_LABELS`).
- `next/navigation` (`notFound`).

<!-- MANUAL: -->
