---
name: house-style
description: Code conventions for bun-mono — duck/feature layout, file-size limits, blank-line groups, strict TypeScript, fast tests. Use when writing or refactoring code in this repo, splitting large files, planning a package refactor, or whenever code structure decisions come up.
---

# bun-mono house style

The repo enforces formatting, lint, and types automatically — see [automation](#automation). This skill documents what mechanical tools **don't** check: structure, sizing, test discipline.

When refactoring a package, work it end-to-end with [the refactor checklist](#package-refactor-checklist).

## Structure: duck / feature, no barrels

**Co-locate by feature**, not by type. A feature directory contains its components, hooks, and utils side by side:

```
royalty/src/
├── card/
│   ├── card-button.tsx
│   ├── card-grid.tsx
│   ├── card-labels.ts        # handLabel, rankLabel, isRedSuit
│   └── use-card-selection.ts
├── seat/
│   ├── human-seat.tsx
│   ├── opponent-seat.tsx
│   └── seat-utils.ts
├── tribute/
│   ├── tribute-panel.tsx
│   ├── return-selector.tsx
│   └── ask-history.tsx
├── engine.ts                 # pure domain — keep cohesive even if long
├── bot.ts
├── storage.ts
├── use-game.ts
└── royalty-app.tsx           # composition root
```

**No `index.ts` barrel files.** Every import goes to the exact file that defines the symbol. Barrels defeat tree-shaking and force bundlers to walk dependency graphs they shouldn't have to. Import `@bun-mono/core-ui/button`, not `@bun-mono/core-ui`.

**One concern per file.** A `.tsx` file may contain one main component plus tightly-coupled sub-components. It should not also export hooks or generic utils — those move to their own file.

### File-size guidance

| Size | Action |
|---|---|
| ≤ 200 lines | Fine as-is |
| 200–400 lines | Acceptable if one concern (pure domain module, single complex component tree). Otherwise split. |
| > 400 lines | Split, unless it's a single cohesive algorithm (e.g. `engine.ts`). |

**Cohesion beats size.** A 629-line game engine with 30 small pure functions is fine; a 400-line component file that mixes 5 sub-components, 3 hooks, and 6 utils is not. The rule isn't line count — it's "if I rename this file, do all its contents move together?"

## Style: blank-line groups

Separate logical groups within a file with a single blank line. Read top-to-bottom, each chunk is a "paragraph":

```ts
const BOT_PASS_MS = 250;
const BOT_PLAY_MS = 500;

export type Seat = 0 | 1 | 2 | 3;
export type Card = { rank: Rank; suit: Suit };

export function compareCards(a: Card, b: Card): number {
  const r = rankIndex(a.rank) - rankIndex(b.rank);
  if (r !== 0) return r;
  return suitIndex(a.suit) - suitIndex(b.suit);
}
```

Inside functions, group statements with blank lines when the next line begins a new "phase" (build → validate → return; setup → loop → output). Don't blank-line every other line — that's noise.

Import grouping is handled by oxfmt (`.oxfmtrc.json`): side-effects → react → external → workspace → internal → relative. Don't hand-edit import order.

## TypeScript

Base config is `packages/config/tsconfig.base.json`. All strict flags are on:

- `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noImplicitOverride`
- `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`
- `noUncheckedSideEffectImports`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- `allowUnreachableCode: false`, `allowUnusedLabels: false`

`isolatedDeclarations` is enabled **per library package**, not on the base config (apps `noEmit` and can't use it). See [Enabling `isolatedDeclarations` on a library package](#enabling-isolateddeclarations-on-a-library-package) for the recipe — currently on in `packages/royalty`.

### Conventions

- **No enums, no namespaces.** `erasableSyntaxOnly` forbids them. Use string-literal union types: `type Title = "king" | "queen" | "third" | "joker"`.
- **`readonly` for collections returned from pure functions.** `readonly Card[]` and `ReadonlySet<Seat>` are already pervasive in `engine.ts` — match that.
- **Branded primitives over loose strings/numbers** when the value has invariants (a seat is `0 | 1 | 2 | 3`, not `number`).
- **`type` over `interface`** unless you need declaration merging. Pre-existing files in the repo all use `type`.
- **No `any`.** Reach for `unknown` and narrow, or fix the type at the boundary.
- **Trust internal code.** Validate at system boundaries (HTTP handlers, DB rows, user input via arktype). Don't re-validate values that already passed the type-checker.

### Enabling `isolatedDeclarations` on a library package

`isolatedDeclarations` makes `.d.ts` emit a per-file operation with no cross-file inference. That lets bundlers like `tsdown` emit declarations without running TS, parallelizes the work, and turns accidental public-API drift into a compile error. The repo target is **on for every library package that ships types**.

Apps (`web`, `server`) `noEmit` and can't use the flag. Don't try.

Adoption recipe (see `packages/royalty/tsconfig.json` for the working example):

1. In the package `tsconfig.json`, add `"isolatedDeclarations": true` and extend the exclude list to skip test files:
   ```jsonc
   {
     "include": ["src/**/*.ts", "src/**/*.tsx"],
     "exclude": ["dist", "node_modules", "**/*.test.ts", "**/*.test.tsx"],
     "compilerOptions": {
       "composite": true,
       "declaration": true,
       "isolatedDeclarations": true
       // ...
     }
   }
   ```
   Excluding tests is required: `tsgo` (the `@typescript/native-preview` build) currently fails to resolve `vitest` imports when `isolatedDeclarations` is on. Tests get type-checked by vitest at runtime — no coverage lost. Bonus: no useless `*.test.d.ts` files emitted to `dist/`.
2. Run `bun tsgo --build --force` from the package directory. The remaining errors are missing return types on **exported** declarations only. Internal helpers and unexported sub-components are unaffected.
3. Fix each export. For React components, the idiom is:
   ```ts
   import { type JSX, useCallback, useState } from "react";

   export function MyComponent(): JSX.Element { /* ... */ }
   ```
   `verbatimModuleSyntax` is on, so use the inline `type` modifier rather than a separate `import type` line.
4. For pure functions, just annotate the return type. Most engine/util code in this repo already has them.
5. Verify with `bun check-types` (turbo, full repo) and the package's tests (`bunx vitest run` from the package — not `bun test`, which uses Bun's runner and doesn't honor the vitest setup).

Per-package cost in this codebase is typically 1–3 annotations.

## Tests

**Fast, focused, non-DOM-first.** Vitest runs whatever you give it; the trade-off is yours.

- **Don't test what TypeScript or oxlint already enforces.** No "rejects invalid input shape" tests when the type signature already rejects it. No "calls function" tests that just restate the implementation.
- **Prefer pure-function tests over component tests.** `engine.test.ts` (1315 lines, no React) is the right shape — drives most of the codebase's behavior coverage cheaply. Component tests are for genuine interaction wiring, not logic.
- **One behavior per test name.** `"king receives a card when ask hits"`, not `"works correctly"`.
- **Reach for `vitest-playwright` only when the test genuinely needs a real browser.** A DOM render to assert a className is the wrong tool — extract the logic and test it directly.
- **Avoid mocks of internal collaborators.** If you need to mock something inside the same package to make a test pass, the seam is probably wrong.

See `packages/royalty/src/engine.test.ts` for the target shape: data in, behavior out, no fixtures, no setup.

## Automation

A Stop hook (`.claude/hooks/stop-fix-and-check.sh`, wired in `.claude/settings.local.json`) runs **automatically** when the assistant finishes a turn:

1. `bun fix` — applies `oxlint --fix` and `oxfmt --write` across the repo.
2. `bun check-types` — turbo-cached type check.

If either fails, the hook exits 2 and surfaces the error so the assistant must address it before stopping. **Don't run these manually mid-task** — they fire on stop. Do run them inline if you want fast feedback after a big change.

The hook **does not** run the full `bun check` (which also runs tests and builds). Before declaring a task done, run:

```sh
bun check
```

`lefthook` separately runs `oxlint --fix` and `oxfmt --write` on staged files at pre-commit, so commits are always formatted.

## Package refactor checklist

When refactoring a package to match this style:

1. **Inventory the largest files.** `wc -l packages/<pkg>/src/**/*.{ts,tsx} | sort -rn | head`.
2. **For each file > 200 lines, classify its exports.** Group them: components, hooks, pure utils, constants, types. A file that has more than one of these groups is a split candidate.
3. **Map features.** Sub-components that share props/state cluster into a feature directory. Standalone utilities go to a `<thing>-utils.ts` sibling.
4. **Move, don't rewrite.** Cut symbols to new files in a single commit per split. Don't change behavior in the same commit.
5. **Delete any `index.ts` you find.** Update imports to point at the concrete file.
6. **Tighten test scope.** When splitting a file, ask: does the existing test file still match? If a test reaches into newly-private internals, it was testing implementation — rewrite to use the public surface.
7. **Flip on `isolatedDeclarations`** if the package ships types (library, not app). Follow the [adoption recipe](#enabling-isolateddeclarations-on-a-library-package). Best done after splitting, since smaller files mean smaller diffs when adding return-type annotations.
8. **Run `bun check`** (full suite) before declaring the package done.

For the largest current offenders see [refactor-targets.md](refactor-targets.md).
