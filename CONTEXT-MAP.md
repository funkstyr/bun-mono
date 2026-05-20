# Context Map

This repo runs in **multi-context** mode. Each context owns its glossary and rules in its own `CONTEXT.md`, co-located with the code it describes. The `grill-with-docs` and `improve-codebase-architecture` skills detect this map and route to the right context.

## Contexts

- [Royalty](./packages/royalty/CONTEXT.md) — four-player shedding card game (engine, bots, tribute, single-player UI). Frontend-only; lives entirely in `packages/royalty/`.
- [Realtime rooms (iteration 2)](./apps/server/CONTEXT.md) — generic PartyKit Room primitive intended to host Royalty multiplayer. **Not yet implemented**; context is forward-looking design.

## Relationships

- **Royalty → Realtime rooms**: iteration 2 will host Royalty as a multiplayer Room kind. Royalty's "Player" concept will be refined: a Player becomes either a bot or a Room **Member** who has claimed a Royalty seat.
- **Realtime rooms → auth**: Members are identified by `userId` from `@bun-mono/auth`. Spectator connections are anonymous.

## System-wide decisions

Cross-context architectural decisions live in [`docs/adr/`](./docs/adr/). Context-scoped decisions (if any emerge) sit in `<context>/docs/adr/` alongside the context file.

## Conventions

- A term defined in a context's glossary must be used exactly there. Other contexts may link to it via `[[term]]` (see `grill-with-docs`'s wiki-link convention).
- Forward-looking context files (like the realtime-rooms one) are allowed but must say so explicitly at the top.
- A new context appears when a body of domain language outgrows the existing contexts and has a natural code home. Add it to this map when you create it.
