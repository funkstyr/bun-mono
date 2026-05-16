---
status: accepted
---

# A Workout's `prepSec` is the single phase between every Set

A **Workout** has a single `prepSec` field. That one duration is played as a green "GET READY" phase at workout start _and_ between every adjacent **Set** in the running sequence, including across **Pass** boundaries. There is no separate `interSetRestSec` field, no inter-pass field, and the per-Set `prepSec` is _not_ used when the Set is running inside a Workout (it is only used when running that Set standalone from the library).

Phase sequence for `[A, B, C] × 2`:

```
prep → A.active/rest×roundsA
     → prep → B.active/rest×roundsB
     → prep → C.active/rest×roundsC
     → prep → A.active/rest×roundsA
     → prep → B.active/rest×roundsB
     → prep → C.active/rest×roundsC
     → complete
```

(Within each Set, the trailing rest of the final round is still skipped, matching the existing single-Set engine. After the final Set of the final Pass, there is no trailing `prep`.)

## Considered Options

- **Separate `workout.interSetRestSec` field, distinct from `prepSec`** (prep at workout start only, a blue REST phase between Sets) — rejected. Most workout-timer apps do this and the visual distinction (green "brace" vs blue "recover") has merit, but it introduces two transition concepts when one is enough, and the user explicitly chose the single-field model.
- **Per-Set `prepSec` fires before every Set in the Workout** (no workout-level field at all) — rejected at Q5b. Surprising on reorder (dropping a `prepSec=0` Set into the first slot silently removes the workout-start countdown), and a single number ends up living in two places (Set and "the gap before a Set in a Workout") with different meanings depending on context.
- **Both fields plus per-Set `prepSec`** — rejected. Three knobs for what is conceptually one gap. High UI complexity, overlapping concepts, easy to misconfigure into double-gaps.

## Consequences

- The engine treats a Workout run as a flat, precomputed phase-descriptor array. Generating it is mechanical: for each of the `repeats` passes, for each Slot in order, emit a `prep` descriptor (duration = `workout.prepSec`) followed by that Set's own `active`/`rest` sequence. The final descriptor is `complete`. `totalRemainingMs` is sum-of-durations from the current index onward. Skip = advance index by one. Reset = back to index 0.
- A standalone **Set** run produces the same flat-array shape (`[prep?, active, rest, ..., active, complete]` using the Set's own `prepSec`). One engine handles both modes; the runner UI has no "workout vs set" branch except in what positional info it displays.
- The Set library entity retains `prepSec` because Sets are still runnable standalone. When a user composes a Workout, the per-Set `prepSec` becomes inert until the Set is run outside a Workout again — this asymmetry needs to be obvious in the editors but does not need a schema change.
- A future "per-slot prep override" capability is additive: a `prepSec?: number` field on the Slot type, no migration.
- A future cooldown phase (out of scope per the v1 PRD) would be a _new_ explicit field on the Workout, not a reinterpretation of `prepSec` or trailing rest.
