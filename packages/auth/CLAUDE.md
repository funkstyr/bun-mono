# packages/auth

better-auth configuration with the drizzle adapter. Consumed by `apps/server` (mounted) and `apps/web` (client).

## Layout

```
src/
├── index.ts                  # better-auth instance + exports
└── reserved-usernames.ts     # Reserved-name list used by sign-up validation
```

## Commands

| Command                                   | Purpose        |
| ----------------------------------------- | -------------- |
| `bun --filter @bun-mono/auth dev`         | tsdown --watch |
| `bun --filter @bun-mono/auth build`       | tsdown         |
| `bun --filter @bun-mono/auth check-types` | tsgo --build   |

## Gotchas

- Schema lives in `@bun-mono/db`; this package wires the drizzle adapter to it. If you add an auth table column, do it in `db/src/schema/auth.ts` and re-run `bun db:generate`.
- Env vars are typed in `@bun-mono/env/server` — don't read `process.env` directly.
- Client wiring lives in `apps/web/src/lib/auth-client.ts`. Public auth surface (sign-in URLs, providers) is configured here.
