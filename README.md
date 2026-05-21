# bun-mono

TypeScript monorepo on **Bun**. Web + realtime server + game packages, with shared schemas, auth, and DB layers.

For codebase orientation, conventions, and per-package gotchas, the source of truth is `CLAUDE.md` (root + per-workspace) and `docs/adr/`.

## Stack

| Layer        | Tool                                    |
| ------------ | --------------------------------------- |
| Runtime / PM | Bun (`bun@1.3.14`) — see `package.json` |
| Task runner  | Turbo (`turbo.json`)                    |
| Linter       | **oxlint** (`.oxlintrc.json`)           |
| Formatter    | **oxfmt** (`.oxfmtrc.json`)             |
| Typechecker  | **tsgo** (`@typescript/native-preview`) |
| Bundler      | **tsdown** (packages → `dist/`)         |
| Web          | TanStack Start + Vite + Tailwind v4     |
| Server       | Hono + oRPC, OpenTelemetry, react-email |
| Realtime     | Bun WebSockets + custom Room actor      |
| DB           | Drizzle ORM + libsql (SQLite / Turso)   |
| Auth         | better-auth                             |
| Pre-commit   | lefthook                                |

## Workspaces

```
bun-mono/
├── apps/
│   ├── web/             # TanStack Start SPA (primary product UI)
│   ├── server/          # Hono + oRPC API, room WS, OpenTelemetry
│   ├── static/          # Vite SPA host for game/timer packages
│   └── e2e/             # Playwright end-to-end suite
└── packages/
    ├── api/             # oRPC routers + arktype/zod schemas
    ├── auth/            # better-auth wiring + drizzle adapter
    ├── config/          # Shared tsconfig.base, vitest, tsdown configs
    ├── core-ui/         # shadcn-derived primitives
    ├── db/              # drizzle schema + libsql client + db:* scripts
    ├── env/             # @t3-oss/env-core schemas (./server, ./web, ./native)
    ├── room-protocol/   # arktype schemas for room events/intents
    ├── room-server/     # Room actor base + chat reducer
    ├── royalty/         # Card-game engine + React UI
    ├── tic-tac-toe/     # Game engine + React UI
    └── workout-timer/   # Timer engine + React UI
```

Each `apps/*` and `packages/*` has its own `CLAUDE.md` with entry points, exports, and local commands.

## First-time setup

```bash
# 1. Install everything (also installs lefthook hooks via postinstall)
bun install

# 2. Create your local server env from the template
cp apps/server/.env.example apps/server/.env
#    The template's DATABASE_URL=file:local.db creates apps/server/local.db.
#    `*.db` is gitignored, so you can't accidentally commit it.

# 3. Generate the local SQLite file and apply migrations (idempotent)
bun db:init

# 4. Start everything
bun dev
```

Then visit:

- Web: <http://localhost:3001>
- API: <http://localhost:3000>

`bun db:init` is the standard local-dev path — no external Turso CLI needed. If you specifically want the libsql HTTP server (e.g. to point Drizzle Studio at it), `bun db:local` runs `turso dev --db-file local.db` instead (requires the Turso CLI).

## Root commands

All run from the repo root. They fan out via Turbo where applicable.

| Command                     | Purpose                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `bun install`               | Install all workspaces                                               |
| `bun dev`                   | Build packages, then run all `dev` tasks (web + server + static)     |
| `bun dev:web`               | Scope `dev` to the web app only                                      |
| `bun dev:server`            | Scope `dev` to the server only                                       |
| `bun build`                 | Build everything                                                     |
| `bun build:packages`        | Build only `packages/*` (needed once before app dev)                 |
| `bun check`                 | **Full gate**: lint + format + check-types + test + build            |
| `bun fix`                   | `oxlint --fix` + `oxfmt --write` — apply mechanical fixes            |
| `bun lint` / `lint:fix`     | oxlint (read-only / autofix)                                         |
| `bun format` / `format:fix` | oxfmt (read-only / autofix)                                          |
| `bun check-types`           | tsgo across all packages                                             |
| `bun test`                  | Run vitest across all packages                                       |
| `bun e2e`                   | Playwright suite (`apps/e2e`) — builds `static` then runs            |
| `bun db:init`               | **Create local SQLite + apply migrations.** Idempotent.              |
| `bun db:local`              | `turso dev --db-file local.db` — libsql HTTP server (Turso CLI req.) |
| `bun db:push`               | `drizzle-kit push` — push schema directly (local dev only)           |
| `bun db:generate`           | Generate migration SQL from schema changes                           |
| `bun db:migrate`            | Apply migrations via drizzle-kit (production path)                   |
| `bun db:studio`             | Open Drizzle Studio                                                  |
| `bun up-deps`               | `taze` minor upgrades across workspaces                              |
| `bun up-deps:major`         | Same but allow major bumps                                           |

To scope a script to one workspace: `bun --filter <name> <script>` (e.g. `bun --filter web dev`, `bun --filter @bun-mono/db build`).

## Dep versions are pinned via the bun catalog

Shared dep versions live in `package.json` → `workspaces.catalog`. Individual packages reference them with `"catalog:"`. **Bump the catalog, not the per-package `package.json`.**

## Git hooks

`lefthook install` runs on `postinstall`, registering:

- **pre-commit**: `oxlint --fix` + `oxfmt --write` on staged files (auto-stages fixes)
- **pre-push**: `bun run scratch:sync` (mirrors GitHub issues to `.scratch/backup/`)

A Claude Code `Stop` hook also runs `bun fix` + `bun check-types` at the end of each AI-assisted turn.

## Domain language & decisions

- **Workspace overview & house style**: root `CLAUDE.md` and the `house-style` skill.
- **Domain terminology**: see `CONTEXT-MAP.md` → per-context `CONTEXT.md` files.
- **Architectural decisions**: `docs/adr/` (e.g. `0007-room-primitive-server-authoritative.md` for the realtime model).
- **Issues**: tracked on GitHub via the `gh` CLI; see `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.
