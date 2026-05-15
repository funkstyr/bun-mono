---
status: accepted
---

# TypeScript native port (tsgo / v7) for type-checking

We replaced the stock TypeScript compiler with `@typescript/native-preview` (the `tsgo` binary, v7 preview) across the monorepo. The native port type-checks ~10× faster, which materially improves the AI agent's `bun check` feedback loop on every iteration. We do not emit JS with `tsc` anywhere — Vite/Bun/`tsdown` handle that — so we only need a type-checker, and tsgo is purpose-built for that role.

## Considered Options

- **Keep stock TypeScript** — rejected for the speed cost on every agent iteration.
- **Run tsgo alongside stock TS** (stock for IDE language server, tsgo for CLI) — rejected. Two compilers means two sources of truth for type errors; an error tsgo catches that the IDE misses (or vice versa) is exactly the kind of drift this whole effort is meant to eliminate.

## Consequences

- Editors (VS Code, Cursor) need the **"TypeScript Native Preview"** extension installed and `"typescript.experimental.useTsgo": true` in workspace settings, otherwise the language server falls back to the editor's bundled TypeScript.
- `bun install` will print peer-dep warnings from packages that list `typescript` as a peer (e.g., parts of the Vite ecosystem, `@types/*`). These are advisory; revisit if anything actually breaks at runtime.
- If tsgo trips on an edge case the codebase actually uses, the fallback is a one-line script change per package (`tsgo --noEmit` → `tsc --noEmit`) plus re-adding `typescript` to the catalog.
