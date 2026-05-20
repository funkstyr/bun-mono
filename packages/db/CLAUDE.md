# packages/db

Drizzle ORM schema + libsql client. Source of truth for all DB tables and migrations.

## Layout

```
src/
├── index.ts          # Client + schema re-exports
└── schema/
    └── auth.ts       # better-auth tables
drizzle.config.ts     # drizzle-kit config (driver, schema path, out dir)
```

## Commands

All `db:*` commands are exposed at the **repo root** and proxied here:

| Root command      | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `bun db:local`    | `turso dev --db-file local.db` — local libsql server |
| `bun db:push`     | `drizzle-kit push` — push schema directly (dev only) |
| `bun db:generate` | Generate migration SQL from schema changes           |
| `bun db:migrate`  | Apply migrations                                     |
| `bun db:studio`   | Open Drizzle Studio                                  |

## Gotchas

- **Schema changes**: edit `src/schema/*.ts`, then `bun db:generate` to produce migration SQL. Commit the generated SQL.
- **better-auth tables** are managed via better-auth's CLI conventions — if you change the auth schema, regenerate via better-auth and adjust `packages/auth` in lockstep.
- `db:push` skips migrations — only use in local dev. Production paths must go through `db:generate` → `db:migrate`.
- Env vars are typed in `@bun-mono/env/server` (e.g. `DATABASE_URL`, auth tokens).
