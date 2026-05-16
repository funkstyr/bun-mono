---
status: accepted
---

# V1→V2 migration: convert each Timer to a Set, do not auto-wrap as a Workout

The v1→v2 storage migration converts each `SavedTimer` (v1) into a `SavedSet` (v2) by lifting its single-element `sets[0]` into the new `config` field. The migration **does not** auto-create a wrapping single-slot Workout for each migrated Timer. After migration, `workouts: []` for every existing user; their data shows up under the new Sets tab and remains runnable standalone, exactly as before. The Workouts tab is empty on first load until the user composes one.

To soften the transition, the **default landing tab** on first load is the tab with content: `workouts` if any exist, otherwise `sets` if any exist, otherwise `workouts` (empty-state CTA).

## Considered Options

- **Auto-wrap each Timer as a single-slot Workout with `prepSec = timer.sets[0].prepSec`, `repeats = 1`** — rejected. Most natural-feeling at first ("everything you had still shows up under the new headline surface"), but it permanently fills every user's Workouts library with one-slot wrappers they didn't ask for. Pre-migration, the user had one library; post-migration, they would have two libraries containing the same things under different names. The cleanup cost lands on the user.
- **Auto-wrap _and_ keep the Set in the Set library** (every Timer becomes both a Set and a single-slot Workout) — rejected for the same reason as above, plus the doubling makes "Used in N workouts" subtext on every Set start at "Used in 1 workout" on day one, which dilutes the signal.
- **Drop the schemaVersion bump and treat the shape change as additive** (keep `timers` and add `workouts` as a parallel top-level field) — rejected. The Timer→Set rename is real, not cosmetic; storing the same kind of thing under the old name forever drifts the data model from the domain language and forces every reader to know about the legacy alias.

## Consequences

- The default-landing logic is the only mechanism existing users have for "wait, where did my timers go?" — implementing it correctly is load-bearing on first-run UX, not nice-to-have.
- The migration function is a single forward-only pass keyed off `schemaVersion: 1`: `{ schemaVersion: 1, timers: [...] } → { schemaVersion: 2, sets: timers.map(toSet), workouts: [] }`. The existing PRD's "v1→v2 is a UI unlock, no migration" framing is superseded — there is now a real (but trivial and lossless) migration.
- The v1 schema's `SavedTimer.sets: [SetConfig]` (length-1 array) turns out to have been a tactical hedge rather than a strategic one. The structural future-proofing it provided wasn't usable as-is for v2: v2 needed a _library_ of Sets, not an inline array within a Timer. The v1 array shape was still cheaper than a flat one to migrate from (`timer.sets[0]` is a one-line lift), so the hedge wasn't wasted, but it didn't avoid the migration.
- A user who had multiple Timers and now wants the v2 Workout behavior must compose Workouts manually. We do not offer a "bulk wrap my old timers" affordance — the assumption is that any user with multiple Timers had reasons to keep them as separate single-block configurations, and a Workout-of-one is not what they were missing.
