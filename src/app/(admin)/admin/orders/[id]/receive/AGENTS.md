<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# receive

## Purpose
"카드 수령 처리" — the admin flow at `/admin/orders/[id]/receive` for marking a physical card as received in store. Shows the order summary and per-card condition-photo upload form.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `async` server component (`force-dynamic`). `params: Promise<{ id: string }>`. Fetches order + cards via `getOrderForAdmin` (`@/lib/orders/queries`), `notFound()` if missing, and renders the receive UI. Condition-photo upload is not wired |

## For AI Agents

### Working In This Directory
- This is the screen that should transition the order from `CARD_DELIVERY_PENDING` (or `PAYMENT_PENDING`) to `CARD_RECEIVED` and stamp `received_at`. When implementing the action, do it via a Server Action and write an `order_status_logs` row in the same transaction (the `previous_status`/`new_status`/`changed_by`/`change_reason` columns exist for this).
- Condition photos upload to Supabase Storage and update `cards.condition_photo_url`.

## Dependencies

### Internal
- `@/lib/orders/queries` (`getOrderForAdmin`).
- `next/navigation` (`notFound`).

<!-- MANUAL: -->
