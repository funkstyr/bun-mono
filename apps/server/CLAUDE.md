# apps/server

Hono + oRPC API server on Bun. Wires up `@bun-mono/api` routers, `@bun-mono/auth`, pino logging, OpenTelemetry, and react-email transactional templates.

## Layout

```
src/
├── index.ts            # Hono app entry — composes oRPC, auth, room WS upgrade, telemetry
├── lib/
│   ├── logger.ts       # pino + pino-http
│   └── tracing.ts      # OpenTelemetry SDK bootstrap (load FIRST in index.ts)
└── emails/
    └── welcome.tsx     # react-email templates (render via @react-email/components)
```

The room WebSocket endpoint is mounted at `WS /ws/room/:slug`; lifecycle is delegated to `@bun-mono/room-server/ws-upgrade`. The default export is `{ fetch, websocket }` — the contract `Bun.serve` expects when serving Hono + Bun WebSockets.

## Commands

| Command                           | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `bun --filter server dev`         | `bun run --hot src/index.ts`                    |
| `bun --filter server build`       | tsdown → `dist/index.js`                        |
| `bun --filter server compile`     | Single-file Bun binary (`server`) with bytecode |
| `bun --filter server start`       | Run built `dist/index.js`                       |
| `bun --filter server test`        | vitest (integration tests under `__tests__/`)   |
| `bun --filter server check-types` | tsgo                                            |

## Gotchas

- **Tracing must initialize before any instrumented code is imported.** `lib/tracing.ts` is loaded at the top of `src/index.ts`; preserve that ordering when refactoring.
- oRPC routers live in `packages/api/src/routers/`, not here. This app composes them.
- Email templates use react-email components; preview with `bunx react-email dev` from this dir.
- Env schema is `@bun-mono/env/server` — add new server vars there.
- libsql client lives in `@bun-mono/db`; this app composes it via `@bun-mono/api` context.
- The realtime **Room** primitive is implemented in `@bun-mono/room-server`. This app only wires the WS upgrade route (`/ws/room/:slug`) — add Room-actor-backed features there, not here.
