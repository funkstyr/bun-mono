# packages/env

`@t3-oss/env-core` schemas for environment variables, split by runtime surface.

## Exports

| Export                 | Use from                                      |
| ---------------------- | --------------------------------------------- |
| `@bun-mono/env/server` | `apps/server`, `packages/auth`, `packages/db` |
| `@bun-mono/env/web`    | `apps/web`, `apps/static`                     |
| `@bun-mono/env/native` | Native targets (future)                       |

## Commands

| Command                                  | Purpose        |
| ---------------------------------------- | -------------- |
| `bun --filter @bun-mono/env dev`         | tsdown --watch |
| `bun --filter @bun-mono/env build`       | tsdown         |
| `bun --filter @bun-mono/env check-types` | tsgo --build   |

## Conventions

- **Never read `process.env` directly anywhere in the monorepo.** Import the typed schema from this package.
- `server` vars must not leak into web bundles — keep `server.ts`'s schema separate from `web.ts`.
- Web/native vars must be prefixed per the framework's public-var convention (e.g. `VITE_*`).
- Adding a new var: declare it in the appropriate file, document its purpose, and update local `.env*` examples.
