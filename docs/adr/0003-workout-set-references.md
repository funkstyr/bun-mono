---
status: accepted
---

# Live Set references in Workouts, with cascading delete-undo

A **Workout** stores its slots as live references (`{ setId }`) to entries in the Set library, not as embedded copies. Editing a Set propagates to every Workout that references it. Deleting a Set commits immediately and cascades by removing every referencing **Slot** from its Workout; the same Undo toast restores both the Set and every removed Slot in its original position. There is no confirmation dialog and no tombstone — the Undo _is_ the safety mechanism, consistent with the existing list-delete UX for individual Sets.

## Considered Options

- **Snapshot-on-compose** (Slot embeds a copy of the Set's config at the moment it was added) — rejected. Most library/playlist UIs do this (Spotify playlists, shopping carts), so it would be unsurprising, but it loses the "I improved my Squats set, every workout benefits" property the user explicitly wants. Snapshots also create silent drift between the library and Workouts that's hard to discover.
- **Reference-with-explicit-detach** (default live; an editor action detaches a Slot into an embedded copy that the user can then customize for that one Workout) — deferred, not rejected. Explicitly noted as a future capability. Costs nothing in today's schema because `slots: { setId: string }[]` can grow per-slot override fields without a migration.
- **Block deletion of a referenced Set** (modal: "Used in N workouts — remove first") — rejected. Breaks the existing sonner-undo pattern for the Set list, adds a confirmation-shaped UI, and is hostile when the user knows what they're doing.
- **Sonner-undo with tombstones** (Slot stays in the Workout pointing at a deleted Set, rendered as a `⚠` placeholder until manually replaced) — rejected. Leaves users with broken Workouts and chores after an Undo window expires. The cascade keeps every Workout in a runnable state at all times.

## Consequences

- The Sets tab shows a "Used in N workouts" subtext on any Set referenced by ≥1 Workout. This is the user's only pre-delete visual signal that the action will cascade — load-bearing for "I almost deleted Squats".
- An emptied-by-cascade Workout (its only Slot was the deleted Set) is left as a 0-slot Workout with an empty-state in the editor, not auto-deleted. We don't delete data the user didn't explicitly delete.
- The Workout editor must handle a slot referencing a setId that no longer exists (deleted in another tab between editor open and save): rendered inline as "⚠ missing — remove", save disabled until resolved.
- The runner snapshots the resolved Workout + its referenced Set configs on `start()`. Edits or deletions in another tab after `start()` do not affect the active run — matches the existing single-Timer snapshot rule.
- If we later add the explicit-detach path, the migration is additive: per-slot `override?: SetConfig` field on the Slot type, no shape change.
