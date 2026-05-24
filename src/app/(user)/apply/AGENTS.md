<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# apply

## Purpose
Multi-step grading application flow at `/apply`. Three steps shown in the indicator: 그레이딩사 선택 → 카드 정보 → 수령 방식. The original 4단계 (동의 및 확인) was removed from this flow on 2026-04-19 — agreement now happens at submit, then the order goes to admin review and the customer sees status updates in mypage.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | `"use client"`. Orchestrator. Holds `formData: ApplyFormData` (initialized from `INITIAL_FORM`), tracks the current step (1–3, `TOTAL_STEPS = 3`), runs per-step validation in `validateStep`, and renders one of `Step2GradingOption` / `Step3CardInfo` / `Step4PickupMethod` based on the step index. Note: file numbering is historical (`step2-` / `step3-` / `step4-`) — do not rename to match the new step indices |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `payment/` | Toss Payments handoff for the prepaid charge (see `payment/AGENTS.md`) |
| `complete/` | Confirmation page shown after a successful application (see `complete/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Form state is `ApplyFormData` from `@/types/apply-form`. To add a field: update the type, the `INITIAL_FORM` factory, the affected step component, and `validateStep` here.
- Step file names (`step2-grading-option.tsx`, `step3-card-info.tsx`, `step4-pickup-method.tsx`) preserve the historical 4-step numbering. The visible step numbers (1–3) come from the orchestrator's `step` state. Do not rename the files — git history relies on it.
- Validation errors are kept in a `string[]` (`errors`) and rendered as a list. Each step's `validateStep` returns a fresh array; merging is replacement, not append.
- Required fields per step: (1) gradingCompany + serviceLevel, (2) every card needs `cardName` + `frontImage`, (3) when `pickupMethod === "DELIVERY"`, `deliveryAddress` is required.
- Submit currently routes to `/apply/payment` (then `/apply/complete?orderId=...`). Real submit must POST cards (with `File`-typed images) to a route handler that uploads to Supabase Storage, inserts `orders` + `cards` rows, then redirects to payment.

## Dependencies

### Internal
- `@/types/apply-form` (`ApplyFormData`, `INITIAL_FORM`).
- `@/components/apply/*` (step components + indicator).
- `@/components/ui/button`.

<!-- MANUAL: -->
