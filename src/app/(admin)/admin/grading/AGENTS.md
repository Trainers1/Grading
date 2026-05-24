<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# grading

## Purpose
Grade-result entry view at `/admin/grading`. Flattens all cards across all orders into a single list so a grading manager can enter `gradeResult` per card without navigating into individual orders.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Server component. Builds `allCards: CardWithOrder[]` by joining `MOCK_CARDS` (keyed by `orderId`) with `MOCK_ORDERS` for each card's grading-company and customer-name context. Renders a per-card row with `gradeResult` input |

## For AI Agents

### Working In This Directory
- The cross-cut view is the natural place for bulk grade entry. When backed by Supabase, prefer a single join query (`select cards.*, orders.grading_company, orders.name from cards join orders on ...`) over N+1 fetches.
- Saving a grade should go through a Server Action that updates `cards.grade_result` and emits an `order_status_logs` entry if it transitions the parent order to `GRADE_CONFIRMED`.

## Dependencies

### Internal
- `@/constants/mock-data` (`MOCK_ORDERS`, `MOCK_CARDS`).

<!-- MANUAL: -->
