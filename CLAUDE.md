# bun-mono

TypeScript monorepo on Bun. Per the Claude Code best-practices guide, this root file stays lean — see per-package `CLAUDE.md` files (in each `apps/*` and `packages/*`) for local conventions, build/test commands, and gotchas.

## Workspace layout

```
bun-mono/
├── apps/
│   ├── web/             # TanStack Start SPA (primary product UI)
│   ├── server/          # Hono + oRPC API, OpenTelemetry, partykit, react-email
│   ├── static/          # Vite SPA host for game/timer packages
│   └── e2e/             # Playwright end-to-end suite
└── packages/
    ├── api/             # oRPC routers + arktype/zod schemas (shared client/server)
    ├── auth/            # better-auth wiring + drizzle adapter
    ├── config/          # Shared tsconfig.base, vitest, tsdown configs
    ├── core-ui/         # shadcn-derived primitives (button, card, dialog, …)
    ├── db/              # drizzle schema + libsql client + db:* scripts
    ├── env/             # @t3-oss/env-core schemas (./server, ./web, ./native)
    ├── royalty/         # Card-game engine + React UI
    ├── tic-tac-toe/     # Game engine + React UI
    └── workout-timer/   # Timer engine + React UI
```

## Tooling

| Concern      | Tool                                                   |
| ------------ | ------------------------------------------------------ |
| Runtime / PM | Bun (`bun@1.3.14`)                                     |
| Task runner  | Turbo (`turbo.json`)                                   |
| Linter       | **oxlint** (`.oxlintrc.json`)                          |
| Formatter    | **oxfmt** (`.oxfmtrc.json`)                            |
| Typechecker  | **tsgo** (`@typescript/native-preview`)                |
| Bundler      | **tsdown** (packages compile to `dist/`)               |
| Pre-commit   | lefthook (`lefthook.yml`)                              |
| Dep versions | Shared via `workspaces.catalog` in root `package.json` |

## Root commands

All run from the repo root. They fan out via Turbo.

| Command                                                                 | Purpose                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `bun install`                                                           | Install all workspaces                                    |
| `bun dev`                                                               | Build packages, then run all `dev` tasks                  |
| `bun dev:web` / `dev:server`                                            | Scope `dev` to one app                                    |
| `bun build`                                                             | Build everything                                          |
| `bun build:packages`                                                    | Build only `packages/*` (needed before app dev)           |
| `bun check`                                                             | **Full gate**: lint + format + check-types + test + build |
| `bun fix`                                                               | `oxlint --fix` + `oxfmt --write`                          |
| `bun lint` / `lint:fix`                                                 | oxlint                                                    |
| `bun format` / `format:fix`                                             | oxfmt                                                     |
| `bun check-types`                                                       | `turbo check-types` (tsgo across all packages)            |
| `bun test`                                                              | `turbo test`                                              |
| `bun e2e`                                                               | Playwright suite (`apps/e2e`)                             |
| `bun db:push` / `db:studio` / `db:generate` / `db:migrate` / `db:local` | Drizzle / Turso, scoped to `@bun-mono/db`                 |
| `bun up-deps`                                                           | `taze` minor upgrades across workspaces                   |

**Use `bun --filter <name> <script>`** to run a script in a single workspace (e.g. `bun --filter web dev`, `bun --filter @bun-mono/db build`).

## Versions are pinned via the bun catalog

Shared dep versions live in `package.json` → `workspaces.catalog`. Individual packages reference them with `"catalog:"`. When bumping a shared dep, edit the catalog, not the per-package `package.json`.

## Conventions

- **House style** (`house-style` skill): duck/feature layout, file-size limits, blank-line groups, strict TS, fast tests. Loaded automatically when relevant; consult it before non-trivial code changes.
- **Domain language**: see `CONTEXT-MAP.md` at the repo root, which points to per-context `CONTEXT.md` files (currently `packages/royalty/` and the forward-looking `apps/server/`).
- **Architectural decisions**: see `docs/adr/`.
- **Issues**: tracked on GitHub Issues via the `gh` CLI (see `docs/agents/issue-tracker.md`). PRDs carry the `prd` label; their child slice issues link back via `Parent: #N`.
- **Triage labels**: canonical roles `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` (see `docs/agents/triage-labels.md`).

## When you finish a turn

A `Stop` hook (`.claude/hooks/stop-fix-and-check.sh`) automatically runs `bun fix` and `bun check-types`. If either fails, the hook blocks Stop and surfaces the error so you can resolve it before declaring done.

## Maintenance

Update this file when:

- Adding or removing a workspace
- Replacing a core tool (linter, formatter, bundler, task runner, runtime)
- Adding a root-level `bun ...` script developers should know about

Per-workspace details (entry points, exports, local gotchas) belong in that workspace's own `CLAUDE.md`, not here.
