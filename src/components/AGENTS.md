<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# components

## Purpose
Shared React components, organized by scope: `ui/` for reusable design-system primitives, `apply/` for the multi-step grading-application form, `admin/` for admin console chrome, `user/` for customer-site chrome and user-facing widgets, and `common/` (currently empty) reserved for cross-scope helpers.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `ui/` | Headless/styled primitives — Button, Input, Checkbox, RadioGroup, Select, Label, Textarea, FileUpload (see `ui/AGENTS.md`) |
| `apply/` | Step components and step indicator for the `/apply` form (see `apply/AGENTS.md`) |
| `admin/` | Admin console layout shell and sidebar (see `admin/AGENTS.md`) |
| `user/` | Customer-site header, footer, and order-status tracker (see `user/AGENTS.md`) |
| `common/` | (empty) reserved for cross-scope shared widgets |

## For AI Agents

### Working In This Directory
- New shared primitives go in `ui/`. Mirror the `Button` pattern: `cva` variants, `forwardRef`, named export plus `<name>Variants` export so callers can compose classnames.
- Feature-scoped components (e.g., a new admin table) belong under the matching feature folder, not `ui/`.
- Components that need browser APIs, state, or events must start with `"use client"`. Most layout/structural components can stay server-rendered.
- Use `cn()` from `@/lib/utils` for class merging. Use design tokens (`bg-primary`, `text-muted-foreground`, `bg-error`) rather than hardcoded hex.

### Common Patterns
- File naming is kebab-case (`order-status-tracker.tsx`, `step3-card-info.tsx`); the exported component name is PascalCase.
- Props interfaces are defined inline above the component.
- The `OrderStatusTracker` (`user/order-status-tracker.tsx`) is the canonical example of mapping the 14-value internal `OrderStatus` enum onto the 7-step user-facing stepper — replicate that mapping logic if you build admin-side timeline views.

## Dependencies

### Internal
- `@/lib/utils` — `cn()` helper.
- `@/types`, `@/constants/grading` — domain types and label maps.
- `@/lib/auth/temp-auth`, `@/lib/auth/actions` — auth-aware components (admin sidebar, user header) read the temp session and render sign-in/sign-out controls.

### External
- `class-variance-authority` for variant primitives.
- `lucide-react` for icons.

<!-- MANUAL: -->
