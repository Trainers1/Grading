<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# orders

## Purpose
Container directory for the per-order customer routes. The `/mypage/orders` URL itself does not render — there is intentionally no `page.tsx` here. The order list lives at `/mypage` (the parent), and clicking an order routes into `/mypage/orders/[id]`.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `[id]/` | Per-order detail page + overcharge payment subroute (see `[id]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Don't add a `page.tsx` here without first deciding what `/mypage/orders` should look like. The current UX folds the list into `/mypage`. If a dedicated list page is added later, refactor `/mypage` to remove the duplicated rendering.

<!-- MANUAL: -->
