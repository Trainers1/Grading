<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# types

## Purpose
TypeScript domain types: status/option unions, entity interfaces (`Order`, `Card`, `User`, `AdminUser`), and the customer apply-form model (`ApplyFormData`, `CardFormData`, `INITIAL_FORM`). These are the camelCase mirrors of the snake_case Postgres schema in `supabase/migrations/`.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Barrel — re-exports the union types and entity interfaces. Prefer `import { Order } from "@/types"` |
| `order.ts` | `OrderStatus` (14 values), `PaymentStatus`, `GradingCompany` (`PSA \| BGS \| CGC \| BRG`), `PickupMethod`, `SpoilerPreference`, plus `Order` and `Card` interfaces |
| `user.ts` | `AdminRole` (4 values: SUPER_ADMIN, STORE_MANAGER, GRADING_MANAGER, CS_AGENT), `User`, `AdminUser` |
| `apply-form.ts` | `CardFormData` and `ApplyFormData` for the multi-step submission form, plus the `INITIAL_CARD` and `INITIAL_FORM` factory constants. `frontImage`/`backImage` are `File \| null`; `declaredValue` is a string in the form and converted to `number` on submit |

## For AI Agents

### Working In This Directory
- The `OrderStatus` union must match the SQL `CHECK` constraint on `orders.order_status` and the label/step maps in `src/constants/grading.ts`. Editing one without the other three will produce silent mismatches at runtime.
- The `GradingCompany` union must match the SQL `CHECK` constraint and the `GRADING_COMPANIES` array in `src/constants/grading.ts`.
- When adding a new entity, also add a barrel re-export in `index.ts`.
- Postgres rows arrive as `snake_case`; convert to `camelCase` at the data-access boundary (server actions, route handlers) — do not introduce snake_case fields into these types.

### Common Patterns
- Discriminated unions are written as `"VALUE_A" | "VALUE_B"` string literals.
- Optional fields use `?:` rather than `| undefined` for consistency with how Supabase rows hydrate.

## Dependencies

### Internal
- `apply-form.ts` imports `GradingCompany`, `PickupMethod`, `SpoilerPreference` from `./order`.

<!-- MANUAL: -->
