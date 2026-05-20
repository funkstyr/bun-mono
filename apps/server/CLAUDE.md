# apps/server

Hono + oRPC API server on Bun. Wires up `@bun-mono/api` routers, `@bun-mono/auth`, pino logging, OpenTelemetry, and react-email transactional templates.

## Layout

```
src/
├── index.ts            # Hono app entry — composes oRPC, auth, partykit, telemetry
├── lib/
│   ├── logger.ts       # pino + pino-http
│   └── tracing.ts      # OpenTelemetry SDK bootstrap (load FIRST in index.ts)
└── emails/
    └── welcome.tsx     # react-email templates (render via @react-email/components)
```

## Commands

| Command                           | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `bun --filter server dev`         | `bun run --hot src/index.ts`                    |
| `bun --filter server build`       | tsdown → `dist/index.js`                        |
| `bun --filter server compile`     | Single-file Bun binary (`server`) with bytecode |
| `bun --filter server start`       | Run built `dist/index.js`                       |
| `bun --filter server check-types` | tsgo                                            |

## Gotchas

- **Tracing must initialize before any instrumented code is imported.** `lib/tracing.ts` is loaded at the top of `src/index.ts`; preserve that ordering when refactoring.
- oRPC routers live in `packages/api/src/routers/`, not here. This app composes them.
- Email templates use react-email components; preview with `bunx react-email dev` from this dir.
- Env schema is `@bun-mono/env/server` — add new server vars there.
- partykit + libsql clients are wired here; persistence schema lives in `@bun-mono/db`.
- The realtime **Room** primitive (iteration 2, not yet built) is designed in `CONTEXT.md` in this directory. Read it before adding PartyKit-backed features.
