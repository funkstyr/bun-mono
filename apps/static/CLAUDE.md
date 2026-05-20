# apps/static

Standalone Vite SPA that hosts the game/timer packages (`royalty`, `tic-tac-toe`, `workout-timer`) without the server-backed auth flow. Deployed as a static bundle (GitHub Pages-style; baseURL `/bun-mono/`).

## Layout

```
src/
├── main.tsx                # Vite entry
├── routeTree.gen.ts        # GENERATED — do not edit
├── routes/                 # File-based routes (royalty.*, tic-tac-toe, timer)
└── components/             # PWA update prompt, header
```

## Commands

| Command                     | Purpose                          |
| --------------------------- | -------------------------------- |
| `bun --filter static dev`   | Vite dev server                  |
| `bun --filter static build` | Production build                 |
| `bun --filter static serve` | Preview built bundle (port 4173) |

## Gotchas

- **Vite base path is `/bun-mono/`** — Playwright (`apps/e2e`) hits `http://localhost:4173/bun-mono/`. If you change the base, update `apps/e2e/playwright.config.ts` in lockstep.
- `src/routeTree.gen.ts` is generated; never hand-edit.
- This app deliberately has **no auth/server dependency** — game routes share the same components as `apps/web` but render standalone. If a route needs auth, it belongs in `apps/web`.
- PWA service worker via `vite-plugin-pwa`; bump version in `vite.config.ts` when shipping cache-busting changes.
