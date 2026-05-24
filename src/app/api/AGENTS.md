<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# api

## Purpose
Reserved root for Next.js Route Handlers. The three placeholder folders below scaffold the planned server-side endpoints; none have been implemented yet — server work currently lives in Server Actions (`src/lib/auth/actions.ts`).

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `auth/` | (empty) reserved for sign-in/sign-up/callback Route Handlers (e.g. `route.ts` files). Auth currently goes through Server Actions in `@/lib/auth/actions` |
| `orders/` | (empty) reserved for order CRUD endpoints (apply submission, status updates, photo uploads) |
| `payments/` | (empty) reserved for Toss Payments confirm/cancel/webhook endpoints |

## For AI Agents

### Working In This Directory
- App Router Route Handlers live in `route.ts` (or `route.{js,tsx}`) files inside each folder, with HTTP verbs as named exports (`export async function POST(req: NextRequest) { ... }`). Do not introduce `pages/api` (this is App Router, not Pages Router).
- Use `@/lib/supabase/server` for database calls — its cookie wiring is the only one that works in Route Handlers.
- Server Actions are the simpler choice for form-driven flows already wired to React components. Reserve Route Handlers for: external webhooks (Toss, Kakao AlimTalk), upload endpoints with non-form `Content-Type`, OAuth callbacks, and anything called by a non-React-form caller.
- New top-level endpoints: prefer extending one of these existing folders rather than creating a new sibling, so the URL surface stays predictable (`/api/orders/...`, `/api/payments/...`).

<!-- MANUAL: -->
