---
status: accepted
---

# CI/CD quality-gate model

We enforce code quality through three layers running the **same canonical command** (`bun check`): a non-blocking lefthook pre-commit hook that auto-fixes (`oxlint --fix`, `oxfmt --write`) and restages, an AI agent's pre-completion check, and a single GitHub Actions job that is the PR merge gate. `bun check` runs cheapest-first — lint → format → types → test → build — so the AI feedback loop sees actionable errors as fast as possible, and so the agent can verify "done" with the exact command CI runs (no drift between local-green and CI-green). Pre-commit is non-blocking on purpose: unfixable lint errors flow to CI rather than interrupting the developer mid-commit; CI's hard gate catches them before merge.

## Considered Options

- **Blocking pre-commit hook** — rejected. Interrupts iteration; AI agents that "claim done" should be gated by `bun check`, not by the act of committing.
- **Parallel CI jobs (lint / format / types / test / build)** — rejected for now. Wall time on a small monorepo is dominated by `setup-bun` + `bun install`; splitting jobs pays that cost N times. Single job also exactly mirrors `bun check`, eliminating local/CI drift. Re-evaluate if `test` becomes the long pole.
- **Turbo Cloud remote cache** — deferred. Local Actions cache (`.turbo/`) is sufficient until CI duration becomes painful.
