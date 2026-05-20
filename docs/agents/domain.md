# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This repo is **multi-context**: a `CONTEXT-MAP.md` at the root lists the contexts and points to a `CONTEXT.md` per context (co-located with the code).

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — lists the contexts.
- The relevant **per-context `CONTEXT.md`** for the area you're touching (currently `packages/royalty/CONTEXT.md` for the card game, `apps/server/CONTEXT.md` for the forward-looking Room primitive).
- **`docs/adr/`** at the root — system-wide architectural decisions.
- Any context-scoped `<context>/docs/adr/` directory (none yet, but the convention is supported).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT-MAP.md
├── docs/adr/                       ← system-wide decisions
├── apps/
│   └── server/
│       └── CONTEXT.md              ← realtime rooms (iteration 2)
└── packages/
    └── royalty/
        └── CONTEXT.md              ← card game
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in its `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids. If the concept you need isn't in any glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Pick the right context

When a topic could plausibly belong to more than one context, prefer the context whose code home matches the area being edited. If still unclear, ask.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
