<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# public

## Purpose
Static assets served from the site root by Next.js. Files in this directory are exposed at `/<filename>` with no build-time transformation.

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `images/` | (empty) reserved for static images referenced by URL |

## For AI Agents

### Working In This Directory
- Anything placed here is publicly served — do not commit secrets, internal docs, or staging artifacts.
- For images that need transformation/optimization (`next/image`), still place sources here; Next will optimize at request time.
- Remote Supabase-hosted images (uploaded card photos) are allowed via the `next.config.ts` `remotePatterns` entry — do not stage user uploads in this directory.

<!-- MANUAL: -->
