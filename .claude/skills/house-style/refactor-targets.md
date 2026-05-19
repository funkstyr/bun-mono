# Refactor targets

Snapshot taken when the skill was written — use as a starting point, not a fixed list. Re-run the inventory before starting:

```sh
for pkg in packages/*/src apps/*/src; do
  echo "== $pkg =="
  find "$pkg" -type f \( -name "*.ts" -o -name "*.tsx" \) ! -name "*.test.*" ! -name "*.gen.*" \
    -exec wc -l {} + 2>/dev/null | sort -rn | head -6
done
```

## Mixed-concern files (split candidates)

These files clearly mix components + hooks + utils + constants and exceed the 400-line threshold. Each needs feature-directory restructure per the [main skill](SKILL.md).

| File | Lines | Notes |
|---|---|---|
| `packages/royalty/src/royalty-app.tsx` | 861 | 14 sub-components, 1 hook, 6 utils, 5 constants |
| `packages/workout-timer/src/workout-editor.tsx` | 600 | |
| `packages/royalty/src/use-game.ts` | 529 | hook + helper functions + types |
| `packages/workout-timer/src/editor-sheet.tsx` | 512 | |
| `packages/workout-timer/src/runner-view.tsx` | 477 | |
| `packages/royalty/src/royalty-watch.tsx` | 414 | |
| `packages/workout-timer/src/list-view.tsx` | 402 | |

## Borderline (200–400, classify before splitting)

| File | Lines |
|---|---|
| `packages/workout-timer/src/use-timers.ts` | 281 |
| `packages/tic-tac-toe/src/tic-tac-toe-app.tsx` | 259 |
| `packages/core-ui/src/dropdown-menu.tsx` | 241 |
| `packages/royalty/src/storage.ts` | 230 |

## Keep as-is (cohesive single-concern)

| File | Lines | Why |
|---|---|---|
| `packages/royalty/src/engine.ts` | 629 | Pure game engine — single concern, all functions tightly related |
| `packages/royalty/src/engine.test.ts` | 1315 | Behavior coverage of the engine |
| `packages/core-ui/src/confetti.tsx` | 168 | Single component |

## Barrel `index.ts` files

Most package `index.ts` files in this repo are real composition roots (exporting composed values like `db`, `auth`, `appRouter`) — those stay.

Pure re-export barrels to remove:

- `packages/db/src/schema/index.ts` (`export * from "./auth"`) — replace with subpath export in `package.json`, or import `./schema/auth` directly.
- `apps/server/src/emails/index.ts` (1 line) — check; if it's `export *`, inline imports.

## Recommended order

1. `royalty/` first — three files in the split list, sets the pattern.
2. `workout-timer/` — four files; reuse patterns from royalty.
3. `tic-tac-toe/` — smaller, sanity-check the pattern.
4. `core-ui/` and the `web/` components — UI library + app components last, since changes here ripple.
