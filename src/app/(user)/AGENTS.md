<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# (user)

## Purpose
Customer-facing route group. The shared layout wraps every customer page in `<UserHeader>` + `<main>` + `<UserFooter>`. The home page (`/`), the multi-step apply flow (`/apply`), my-page (`/mypage`), authentication pages (`/login`, `/register`), and the static `terms` / `privacy` pages all live under this group.

## Key Files

| File | Description |
|------|-------------|
| `layout.tsx` | Server component that wraps `children` in `flex min-h-screen flex-col`, with `<UserHeader />` above and `<UserFooter />` below |
| `page.tsx` | The `/` home page. Hero CTA → `/apply`, service flow explainer, grading-company list pulled from `GRADING_COMPANIES`, FAQ block (택배 수령 안내 included) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `(auth)/` | Customer login + register, route group so the auth pages can omit chrome later if needed (see `(auth)/AGENTS.md`) |
| `apply/` | Multi-step grading application flow + payment + completion (see `apply/AGENTS.md`) |
| `mypage/` | Customer order list, order detail, overcharge payment, profile (see `mypage/AGENTS.md`) |
| `privacy/` | (empty) reserved for the privacy policy page |
| `terms/` | (empty) reserved for the terms-of-service page |

## For AI Agents

### Working In This Directory
- The route group `(user)` is the URL-invisible parent for all customer-facing routes. Anything that should not show site chrome (e.g. dedicated print views) should sit outside this group or override the layout via a nested `layout.tsx`.
- The home page imports `buttonVariants` from `@/components/ui/button` to render `Link` as a button — preserve that pattern; do not wrap a `Link` in `<Button>` (it produces nested anchors).
- `/privacy` and `/terms` directories exist but contain no `page.tsx`. Visiting them currently 404s. Add a `page.tsx` to either when the actual content lands.

## Dependencies

### Internal
- `@/components/user/{user-header,user-footer}` — chrome.
- `@/components/ui/button` (`buttonVariants`).
- `@/constants/grading` (`GRADING_COMPANIES`).

<!-- MANUAL: -->
