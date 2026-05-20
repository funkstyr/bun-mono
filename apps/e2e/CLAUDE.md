# apps/e2e

Playwright end-to-end suite. Targets the **`apps/static` preview server** (port 4173, base path `/bun-mono/`).

## Layout

```
tests/
└── tic-tac-toe/
    └── happy-path.spec.ts
```

## Commands

| Command                        | Purpose                       |
| ------------------------------ | ----------------------------- |
| `bun e2e`                      | Run the suite (root shortcut) |
| `bun --filter e2e test:e2e`    | Same, scoped via Turbo        |
| `bun --filter e2e test:e2e:ui` | Open the Playwright UI runner |

## Gotchas

- `playwright.config.ts` starts the static app via `bun --cwd=../static run serve`; CI requires a built `static` bundle (`turbo` enforces `static#build` as a `test:e2e` dependency).
- baseURL is `http://localhost:4173/bun-mono/` — relative paths in specs are resolved against it.
- Only `chromium` is configured; add a project entry to expand browser coverage.
- Tests run **fully in parallel** locally; CI uses 1 worker with 2 retries.
- Reports land in `playwright-report/` and traces in `test-results/` — both gitignored and in `permissions.deny`.
