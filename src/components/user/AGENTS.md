<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# user

## Purpose
Customer-facing layout chrome and shared user-side widgets — global header (with auth-aware sign-in/sign-out), site footer, and the order-status timeline tracker used on order detail pages.

## Key Files

| File | Description |
|------|-------------|
| `user-header.tsx` | Top navigation. Reads `getTempSession()` server-side and renders either a sign-in link or a sign-out form depending on session state |
| `user-footer.tsx` | Footer with brand block, store address (경기 안양시 동안구 평촌대로217번길 15 3층), business hours, contact, and links to `/terms` + `/privacy` |
| `order-status-tracker.tsx` | `"use client"` 7-step vertical timeline. Maps the 14-value internal `OrderStatus` onto `ORDER_STATUS_STEPS` via `getStepNumber` — collapses `DISTRIBUTOR_*`, `GRADING_COMPANY_*` into "그레이딩 진행 중", `GRADING_COMPANY_RETURNED`/`DISTRIBUTOR_ARRIVED` into "등급 확정", and treats `READY_FOR_PICKUP` as "트레이너스 도착" |

## For AI Agents

### Working In This Directory
- `user-header.tsx` is server-rendered to read the cookie session before the sign-out form appears. Sign-out posts to `signOutAction` from `@/lib/auth/actions`. When Supabase Auth lands, swap the `getTempSession` call for a Supabase server client read.
- The footer's address/hours/phone block is hardcoded copy. If marketing changes those strings, edit here — they are not in `constants/`.
- `OrderStatusTracker.getStepNumber` and `ORDER_STATUS_STEPS` (in `@/constants/grading`) are the **single source of truth** for the customer-facing pipeline view. If you add a new internal status, decide which user-facing step it should collapse into and update both `getStepNumber` and the matching label/step list.

## Dependencies

### Internal
- `@/lib/auth/temp-auth`, `@/lib/auth/actions` — header is auth-aware.
- `@/constants/grading` (`ORDER_STATUS_STEPS`).
- `@/types` (`OrderStatus`).
- `@/lib/utils` (`cn`).

<!-- MANUAL: -->
