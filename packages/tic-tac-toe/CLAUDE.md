# packages/tic-tac-toe

Tic-tac-toe: pure engine + React UI + bot + persistence. Consumed by `apps/web` and `apps/static` via subpath exports.

## Layout

```
src/
├── engine.ts, engine.test.ts        # Pure game engine
├── use-game.ts, use-game.test.ts    # React hook bridging engine ↔ UI
├── storage.ts                       # Persistence
├── game.tsx                         # Board component
├── tic-tac-toe-app.tsx              # App shell (subpath-exported)
├── side-selector.tsx
└── difficulty-selector.tsx
```

## Subpath exports

`./engine`, `./use-game`, `./tic-tac-toe-app`, `./styles.css`.

## Commands

| Command                                          | Purpose        |
| ------------------------------------------------ | -------------- |
| `bun --filter @bun-mono/tic-tac-toe dev`         | tsdown --watch |
| `bun --filter @bun-mono/tic-tac-toe build`       | tsdown         |
| `bun --filter @bun-mono/tic-tac-toe test`        | vitest run     |
| `bun --filter @bun-mono/tic-tac-toe check-types` | tsgo --build   |

## Conventions

- **Engine is pure** — same rule as `@bun-mono/royalty`. Tests must run without jsdom.
- `react`, `react-dom`, `tailwindcss` are peerDependencies.
- App shell (`tic-tac-toe-app.tsx`) is what apps mount; route files in `apps/{web,static}` should be thin wrappers around it.
