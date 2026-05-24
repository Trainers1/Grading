<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# constants

## Purpose
Domain constants and mock data. `grading.ts` is the canonical source of label/step metadata for orders and grading companies — all customer-facing copy and the user mypage stepper read from here. `mock-admin-data.ts` still seeds the admin `batches` and `settings` pages while their API layer is unbuilt; replace these imports as real Supabase queries come online. (`mock-data.ts` was removed once all customer/admin order pages moved to `@/lib/orders/queries`.)

## Key Files

| File | Description |
|------|-------------|
| `grading.ts` | `GRADING_COMPANIES` (4 entries with label/description/url), `ORDER_STATUS_LABELS` (14-key Korean label map — note `READY_FOR_PICKUP` and `TRAINERS_ARRIVED` both surface as "트레이너스 도착"), `ORDER_STATUS_STEPS` (7-step user-facing stepper that collapses internal pipeline states), `PAYMENT_STATUS_LABELS`, and `PHOTO_UPLOAD` (10MB cap, JPEG/PNG only). Also exports the `GradingService` interface |
| `mock-admin-data.ts` | Admin-side mock fixtures (`MOCK_BATCHES`, `BATCH_STATUS_LABELS`, `MOCK_ADMIN_USERS`) still consumed by the admin `batches` and `settings` pages |

## For AI Agents

### Working In This Directory
- **Editing `ORDER_STATUS_LABELS` or `ORDER_STATUS_STEPS`?** The 14-value `OrderStatus` union (`src/types/order.ts`) and the SQL `CHECK` constraint (`supabase/migrations/001_initial_schema.sql`) must agree. Adding a status touches all four locations.
- The user-facing stepper deliberately collapses internal states: `DISTRIBUTOR_SHIPPED`, `DISTRIBUTOR_RECEIVED`, `GRADING_COMPANY_SHIPPED`, `GRADING_COMPANY_RECEIVED` all map to step 4 ("그레이딩 진행 중"); `GRADING_COMPANY_RETURNED`, `DISTRIBUTOR_ARRIVED` collapse into step 5; `READY_FOR_PICKUP` is treated as the "트레이너스 도착" step. The mapping function lives in `src/components/user/order-status-tracker.tsx` — keep them aligned.
- Mock data deletion: when wiring a page to real Supabase queries, **replace** the `MOCK_*` import with the real fetch. Do not leave both in place.
- New label maps for additional enums (e.g. `BATCH_STATUS_LABELS` if needed) belong here, not inline in components.

## Dependencies

### Internal
- `grading.ts` imports `GradingCompany` from `@/types`.

<!-- MANUAL: -->
