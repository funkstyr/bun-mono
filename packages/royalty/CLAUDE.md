# packages/royalty

Royalty card-game: pure engine + React UI + bot + persistence. Consumed by `apps/web` and `apps/static` via subpath exports.

## Layout

```
src/
├── engine.ts, engine.test.ts             # Pure game engine
├── scoring.ts, scoring.test.ts           # Pure scoring
├── bot.ts                                # AI opponent
├── use-game.ts, use-game.test.ts         # React hook bridging engine ↔ UI
├── use-game-helpers.ts
├── storage.ts, storage.test.ts           # Persistence
├── royalty-app.tsx, royalty-watch.tsx    # App shells (subpath-exported)
├── play-log.tsx, session-summary-modal.tsx,
│   top-hand.tsx, rules-modal.tsx, end-game-overlay.tsx
└── card/
    ├── card-button.tsx, card-face.tsx, card-grid.tsx, card-labels.ts
```

## Subpath exports

`./engine`, `./bot`, `./use-game`, `./royalty-app`, `./royalty-watch`, `./styles.css`. Consumers import via the subpath, not the package root.

## Commands

| Command                                      | Purpose        |
| -------------------------------------------- | -------------- |
| `bun --filter @bun-mono/royalty dev`         | tsdown --watch |
| `bun --filter @bun-mono/royalty build`       | tsdown         |
| `bun --filter @bun-mono/royalty test`        | vitest run     |
| `bun --filter @bun-mono/royalty check-types` | tsgo --build   |

## Conventions

- **Engine is pure** — no React, no DOM, no I/O. Tests must run without jsdom.
- **React glue lives in hooks** (`use-game.ts`) — UI components stay dumb.
- **Card primitives** in `src/card/` are reusable across games — extend rather than fork.
- `react`, `react-dom`, `tailwindcss` are peerDependencies.
- Domain language (rounds, hands, royalty) lives in this package's `CONTEXT.md` — keep terminology aligned.
