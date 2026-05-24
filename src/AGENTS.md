<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# src

## Purpose
All application source code. Layout follows Next.js App Router conventions with route groups (`(admin)`, `(user)`, `(auth)`) for layout/auth segregation, plus shared `components/`, `lib/`, `types/`, and `constants/` modules consumed via the `@/*` path alias.

## Key Files

| File | Description |
|------|-------------|
| `middleware.ts` | Edge middleware entrypoint — delegates to `lib/supabase/middleware.ts:updateSession`. The `matcher` skips static assets and image extensions; everything else passes through |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router pages, layouts, API routes (see `app/AGENTS.md`) |
| `components/` | Shared React components — UI primitives, feature views, layout shells (see `components/AGENTS.md`) |
| `constants/` | Domain constants, label maps, and mock data (see `constants/AGENTS.md`) |
| `lib/` | Library code — Supabase clients, auth helpers, utilities (see `lib/AGENTS.md`) |
| `types/` | TypeScript domain types and form models (see `types/AGENTS.md`) |
| `hooks/` | (empty) reserved for shared React hooks |
| `styles/` | (empty) reserved for non-global stylesheets — global styles live in `app/globals.css` |

## For AI Agents

### Working In This Directory
- Always import from `@/*` rather than relative paths beyond a single hop (`../../foo` is a smell — use `@/lib/foo`).
- Server-only code (anything that imports `next/headers`, server actions, or `@supabase/ssr`'s `createServerClient`) must not be imported from a `"use client"` module.
- New feature code should land in the right module: shared types → `types/`, label/option metadata → `constants/`, Supabase access → `lib/supabase/` or a new `lib/<feature>/` folder, presentational components → `components/<scope>/`.

### Common Patterns
- Barrel exports: `types/index.ts` re-exports the domain unions and interfaces. Prefer `import { Order } from "@/types"` over deep imports.
- Korean comments and Korean copy are the convention; preserve when editing.

## Dependencies

### Internal
- All subdirectories are interlinked via `@/*` imports.

### External
- `@supabase/ssr` powers cookie-aware Supabase clients (Server Component, Browser, Middleware).

<!-- MANUAL: -->
