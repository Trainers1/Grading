# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

트레이너스(TRAINERS) grading proxy service — a Korean-language Next.js app that takes trading card submissions, forwards them to overseas grading companies (PSA, BGS, CGC, BRG), and returns the slabs to customers. UI copy, log/error messages, and comments are written in Korean; keep that convention when adding new strings.

## Commands

Package manager is **pnpm 10.33** (see `packageManager` field). Do not introduce npm/yarn lockfiles.

- `pnpm dev` — start Next.js dev server with Turbopack
- `pnpm build` — production build
- `pnpm start` — run the built app
- `pnpm lint` — `next lint` (ESLint 10 + `eslint-config-next`)

There is no test runner configured yet; do not assume `pnpm test` works.

Environment variables (see `.env.local.example`): Supabase URL/anon/service-role, Toss Payments client/secret keys, Kakao AlimTalk keys. The app degrades gracefully in middleware when Supabase env vars are missing (dev fallback in `src/lib/supabase/middleware.ts`).

Web Push: VAPID 키 3종 (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) + `CRON_SECRET` 추가됨 (`.env.local.example` 참조). **`VAPID_PRIVATE_KEY`는 dev/staging/prod 환경별 분리 발급 — production 키를 dev에 노출 금지.**

Vercel Cron: `vercel.json`에 `*/5 * * * *` 등록됨 — Vercel 대시보드에 VAPID 3종 + `CRON_SECRET` env 입력 필요. Vercel Pro 플랜 필수 (5분 cron 보장). Supabase pg_cron 폴백은 `docs/qa/push-pg-cron-fallback.md` 참조.

## Architecture

### Routing (App Router, route groups)

Under `src/app/`:

- `(admin)/admin/**` — admin console. Wrapped by `AdminSidebar` layout. Subroutes: `(dashboard)`, `orders/[id]/receive`, `batches`, `grading`, `overcharges`, `users`, `settings`, `login`.
- `(user)/**` — customer-facing site. Wrapped by `UserHeader`/`UserFooter` layout. Includes home (`page.tsx`), `apply` (multi-step submission form), `apply/payment`, `apply/complete`, `mypage`, `mypage/orders/[id]`, `mypage/profile`, `privacy`, `terms`, and the nested `(auth)/login` + `(auth)/register` group.
- `api/{auth,orders,payments}/` — API route directories exist but are currently empty; server logic for these flows is not yet implemented.

Auth + route protection lives in a **single root middleware** (`src/middleware.ts` → `src/lib/supabase/middleware.ts`). It refreshes the Supabase session on every request and enforces:

- `/apply` and `/mypage` require a logged-in user; unauthenticated requests redirect to `/login?redirect=<path>`.
- `/admin/**` (except `/admin/login`) requires a logged-in user; otherwise redirects to `/admin/login`.

Any new protected route must either sit under one of these prefixes or be added to the `protectedPaths` list.

### Supabase clients — use the right one

Three distinct clients, all from `@supabase/ssr`:

- `src/lib/supabase/client.ts` → `createBrowserClient` for Client Components (`"use client"`).
- `src/lib/supabase/server.ts` → `createServerClient` with `next/headers` cookies, for Server Components / Route Handlers / Server Actions.
- `src/lib/supabase/middleware.ts` → `createServerClient` with `NextRequest`/`NextResponse` cookie plumbing, used **only** by the root middleware. The `setAll` callback rebuilds `supabaseResponse` — preserve that pattern if editing.

### Domain model

Schema is in `supabase/migrations/001_initial_schema.sql`. Core entities:

- `profiles` (mirrors `auth.users`; auto-populated via the `handle_new_user` trigger on signup)
- `admin_users` with role ∈ `SUPER_ADMIN | STORE_MANAGER | GRADING_MANAGER | CS_AGENT`
- `grading_services` (dynamic service catalogue per company)
- `orders` (PK is a human-readable `YYYYMMDD-순번` string, not a UUID) → `cards` (1:N)
- `order_status_logs` for audit trail
- `payments` (Toss Payments; types `PREPAYMENT | OVERCHARGE | REFUND | SHIPPING`)
- `batches` + `batch_orders` for monthly dispatch to the grading company

TypeScript mirrors of these live in `src/types/` (**camelCase**) while Postgres uses **snake_case** — conversion happens at the data-access boundary. `src/types/index.ts` is the barrel; prefer `import { Order } from "@/types"`.

### Order lifecycle — single source of truth

The 8-value `order_status` CHECK constraint in SQL, the `OrderStatus` union in `src/types/order.ts`, the `ORDER_STATUS_LABELS` map, and the 7-step `ORDER_STATUS_STEPS` stepper in `src/constants/grading.ts` must stay in sync. The customer-facing stepper intentionally collapses some internal states (e.g. `DISTRIBUTOR_RECEIVED`, `GRADING_COMPANY_SHIPPED`, `GRADING_COMPANY_RETURNED` are not shown as user-visible steps). When adding a status, update all four places plus `PAYMENT_STATUS_LABELS` if payment flows are affected.

Grading companies are a fixed 4-value union (`PSA | BGS | CGC | BRG`) across SQL CHECK constraints, the `GradingCompany` type, and `GRADING_COMPANIES` metadata in `src/constants/grading.ts`.

### Apply form

`/apply` is a multi-step form. `src/types/apply-form.ts` defines `ApplyFormData` and `INITIAL_FORM`. Step components in `src/components/apply/` (`step2-grading-option`, `step3-card-info`, `step4-pickup-method`, `step5-agreement`) are orchestrated from `src/app/(user)/apply/page.tsx`. Card images use `File` objects in form state; `declaredValue` is a string in the form and converted to `number` on submit.

### UI conventions

- Tailwind v4 with design tokens declared in `src/app/globals.css` via `@theme` (brand primary `#1a237e`, secondary `#e53935`, plus `success/warning/error/info` and `radius-{sm,md,lg,xl}`). Use these token names (e.g. `bg-primary`, `text-muted-foreground`) rather than hardcoding hex.
- `cn()` helper in `src/lib/utils.ts` wraps `clsx` + `tailwind-merge`.
- `class-variance-authority` is used for variant-based components (see `src/components/ui/button.tsx` as the canonical pattern). Reuse this pattern for new variant-driven UI primitives.
- Path alias `@/*` → `./src/*` (tsconfig).

### Mock data

`src/constants/mock-data.ts` exports `MOCK_ORDERS` and `MOCK_CARDS` used by pages while the API layer is unbuilt. When wiring a page to real Supabase queries, replace these imports rather than leaving both in place.
