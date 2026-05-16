import type { SavedSet, SavedWorkout } from "./schemas";

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function computeWorkoutDuration(
  workout: SavedWorkout,
  resolvedSets: ReadonlyArray<SavedSet | undefined>,
): number {
  const prepMs = workout.prepSec * workout.slots.length * workout.repeats * 1000;
  let perPassMs = 0;
  for (const set of resolvedSets) {
    if (!set) continue;
    const { rounds, activeSec, restSec } = set.config;
    perPassMs += rounds * activeSec * 1000 + Math.max(0, rounds - 1) * restSec * 1000;
  }
  return prepMs + perPassMs * workout.repeats;
}
