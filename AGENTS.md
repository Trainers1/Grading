<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# trainers-grading

## Purpose
트레이너스(TRAINERS) grading proxy service — a Korean-language Next.js 16 App Router application that accepts trading-card grading submissions, forwards them to overseas grading companies (PSA, BGS, CGC, BRG), and returns the slabs to customers. UI copy, log/error messages, and source comments are all in Korean.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | pnpm 10.33 manifest. Pinned via the `packageManager` field — do not introduce npm/yarn lockfiles |
| `pnpm-lock.yaml` | Authoritative lockfile |
| `tsconfig.json` | Strict TS, `@/* → ./src/*` path alias, Next.js plugin |
| `next.config.ts` | Allows remote images from `*.supabase.co` |
| `postcss.config.mjs` | Tailwind v4 PostCSS plugin |
| `next-env.d.ts` | Next-generated type shim — do not edit |
| `.env.local.example` | Required env vars: Supabase URL/anon/service-role, Toss client/secret, Kakao AlimTalk |
| `CLAUDE.md` | Project guidance for Claude Code (Korean copy convention, architecture pointers) |
| `.gitignore` | Ignores `.env*`, `node_modules`, `.next`, `.omc`, `tsconfig.tsbuildinfo` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source (App Router pages, components, lib, types, constants) — see `src/AGENTS.md` |
| `supabase/` | Postgres schema migrations — see `supabase/AGENTS.md` |
| `public/` | Static assets served at the site root — see `public/AGENTS.md` |
| `.omc/` | oh-my-claudecode session/state directory — generated, do not commit by hand |

## Commands

| Script | What it does |
|--------|--------------|
| `pnpm dev` | Next.js dev server with Turbopack |
| `pnpm build` | Production build |
| `pnpm start` | Run the built app |
| `pnpm lint` | `next lint` (ESLint 10 + `eslint-config-next`) |

There is no test runner configured. Do not assume `pnpm test` works.

## For AI Agents

### Working In This Repository
- Korean is the default language for UI copy, error messages, log messages, and any user-visible string. Comments may be Korean or English.
- Use the `cn()` helper (`src/lib/utils.ts`) and Tailwind v4 design tokens (`bg-primary`, `text-muted-foreground`, etc.) declared in `src/app/globals.css`. Avoid hardcoded hex.
- Never run `pnpm install` to add a dependency without confirming with the user — pinning matters.
- App Router conventions: server components by default; add `"use client"` only when needed (event handlers, hooks).

### Auth & Route Protection
A single root middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) refreshes the Supabase session on every request and enforces:

- `/apply`, `/mypage` → require any logged-in user; otherwise redirect to `/login?redirect=<path>`.
- `/admin/**` (except `/admin/login`) → require an `admin` role; otherwise redirect to `/admin/login`.

A temporary hardcoded auth layer (`src/lib/auth/temp-auth.ts`) runs in parallel with Supabase Auth until the real backend lands. Two seeded accounts: `customer1@example.com / 1234` and `host1@example.com / 1234`. Remove the `temp-auth` branch and accounts when Supabase Auth is wired.

### Domain Invariants — Single Source of Truth
The order-status enum lives in **four** places that must stay in sync:

1. The 14-value `CHECK` constraint in `supabase/migrations/001_initial_schema.sql` on `orders.order_status`.
2. The `OrderStatus` union in `src/types/order.ts`.
3. The `ORDER_STATUS_LABELS` map in `src/constants/grading.ts`.
4. The 7-step `ORDER_STATUS_STEPS` user-facing stepper in `src/constants/grading.ts` (collapses internal states `DISTRIBUTOR_RECEIVED`, `GRADING_COMPANY_SHIPPED`, `GRADING_COMPANY_RETURNED`, etc.).

Same rule for grading companies (`PSA | BGS | CGC | BRG`): SQL CHECK + `GradingCompany` type + `GRADING_COMPANIES` metadata.

If you add or remove a status, update all four — and `PAYMENT_STATUS_LABELS` if payment flows are touched.

### Testing Requirements
- No automated test suite. After UI changes, start `pnpm dev` and verify the affected pages in a browser. State this explicitly when reporting completion if you cannot test the UI.
- Run `pnpm lint` and a TypeScript compile (`pnpm build` or relying on the editor) before claiming a task is done.

### Common Patterns
- Path alias `@/*` → `./src/*`.
- Variant-driven UI primitives use `class-variance-authority` — see `src/components/ui/button.tsx` as the canonical pattern.
- Postgres uses `snake_case`; TypeScript mirrors use `camelCase`. Convert at the data-access boundary.
- Order PKs are human-readable strings (`YYYYMMDD-순번`), not UUIDs.
- Mock data in `src/constants/mock-data.ts` and `src/constants/mock-admin-data.ts` powers pages while the API layer is unbuilt — replace these imports when wiring real Supabase queries rather than leaving both in place.

## Dependencies

### External (production)
- `next@^16.2.1` — App Router, Turbopack
- `react@^19.2.4`, `react-dom@^19.2.4`
- `@supabase/ssr@^0.9.0`, `@supabase/supabase-js@^2.100.1` — auth + DB client
- `tailwindcss@^4.2.2`, `@tailwindcss/postcss` — styling (v4, no `tailwind.config.*`)
- `class-variance-authority`, `clsx`, `tailwind-merge` — variant + class utilities
- `lucide-react` — icons

### External (dev)
- `typescript@^6`, `@types/*`
- `eslint@^10`, `eslint-config-next`

<!-- MANUAL: Custom project notes can be added below -->
