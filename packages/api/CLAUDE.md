# packages/api

oRPC routers, contracts, and shared schemas. Consumed by `apps/server` (mounts the routers) and `apps/web` (typed client via `@orpc/client`).

## Layout

```
src/
├── index.ts                  # Public exports
├── context.ts                # oRPC context (auth, db, request, …)
├── routers/
│   ├── index.ts              # Root router composition
│   └── account.ts            # Per-feature routers
└── lib/
    ├── validate-username.ts  # + .test.ts
    └── parse-user-agent.ts   # + .test.ts
```

## Commands

| Command                                  | Purpose        |
| ---------------------------------------- | -------------- |
| `bun --filter @bun-mono/api dev`         | tsdown --watch |
| `bun --filter @bun-mono/api build`       | tsdown         |
| `bun --filter @bun-mono/api test`        | vitest run     |
| `bun --filter @bun-mono/api check-types` | tsgo --build   |

## Conventions

- One router file per feature in `src/routers/`, composed in `src/routers/index.ts`.
- Schemas use **arktype** by default; zod is allowed where ecosystem (better-auth, drizzle) expects it.
- Pure helpers in `src/lib/` co-locate `.test.ts` next to source — keep tests fast (no network, no real DB).
- Context shape is the single source of truth — don't grow it ad-hoc; thread dependencies through the context.
- This package is imported by both server (mount) and web (typed client). Don't import Node-only or Bun-only APIs here.
