<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# ui

## Purpose
Headless / styled design-system primitives shared across customer and admin UIs. Each primitive is a thin wrapper around a native HTML element styled with Tailwind tokens, with `cva` variant control where useful.

## Key Files

| File | Description |
|------|-------------|
| `button.tsx` | `Button` + `buttonVariants` — variants: `default \| secondary \| outline \| ghost \| link \| destructive`; sizes: `default \| sm \| lg \| icon`. Uses `cva`, `forwardRef`, and the `cn()` helper. **Canonical pattern for new variant-driven primitives** |
| `input.tsx` | Text input |
| `textarea.tsx` | Textarea |
| `label.tsx` | `<label>` |
| `checkbox.tsx` | Native `<input type="checkbox">` styled wrapper |
| `radio-group.tsx` | Radio group primitive |
| `select.tsx` | `<select>` wrapper |
| `file-upload.tsx` | File input with image preview, used by the apply form for card photos. Honors `PHOTO_UPLOAD` limits from `src/constants/grading.ts` (10MB, JPEG/PNG) |

## For AI Agents

### Working In This Directory
- New primitives: copy the `button.tsx` shape — `cva` for variants, `forwardRef`, named export plus `<name>Variants` re-export so callers can compose classnames.
- Style with design tokens (`bg-primary`, `text-primary-foreground`, `bg-error`, `bg-muted`) — never hardcode hex.
- Keep these primitives presentational. Form-state logic, validation, and feature behavior belong in the consuming feature folder (`src/components/apply/`, page-level components, etc.).
- These primitives are the only place that should know about token names like `ring-ring`, `border-input`, `bg-background` — features should compose primitives, not redeclare token classes.

### Common Patterns
- Components use `forwardRef` so consumers can attach refs (form libraries, focus management).
- File names are kebab-case; component names are PascalCase (`Button`, `FileUpload`).

## Dependencies

### Internal
- `@/lib/utils` (`cn`).
- `@/constants/grading` (`PHOTO_UPLOAD` from `file-upload.tsx`).

### External
- `class-variance-authority` (`cva`, `VariantProps`).

<!-- MANUAL: -->
