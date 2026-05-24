<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# users

## Purpose
Customer list at `/admin/users`. Shows all registered users (mocked) with phone-verified flag, signup provider, block status, and the count of orders each user has placed.

## Key Files

| File | Description |
|------|-------------|
| `page.tsx` | Async server component (`force-dynamic`). Fetches profiles + orders via `@/lib/orders/queries` (`getAllProfilesForAdmin`, `getAllOrdersForAdmin`) and joins them on `Order.userId === User.id` for per-user order counts. Local `PROVIDER_LABELS` maps `email/kakao/naver` to Korean labels |

## For AI Agents

### Working In This Directory
- This is the **customer** users list, not the admin staff list. Admin staff (the `admin_users` table) is rendered from `/admin/settings`.
- The `provider` column is `email | kakao | naver`. New providers go in `profiles.provider` and the `PROVIDER_LABELS` map together.
- Blocking a user should go through a Server Action that toggles `profiles.is_blocked` and writes a `block_reason` — the schema already supports this (`is_blocked`, `block_reason` columns).

## Dependencies

### Internal
- `@/lib/orders/queries` (`getAllProfilesForAdmin`, `getAllOrdersForAdmin`).

<!-- MANUAL: -->
