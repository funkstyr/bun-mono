import type { SavedWorkout, Slot } from "./schemas";

export type RemovedSlot = { workoutId: string; slotIndex: number; slot: Slot };

export function cascadeDeleteSet(
  workouts: readonly SavedWorkout[],
  setId: string,
): { nextWorkouts: SavedWorkout[]; removedSlots: RemovedSlot[] } {
  const removedSlots: RemovedSlot[] = [];
  const nextWorkouts: SavedWorkout[] = [];

  for (const workout of workouts) {
    let matched = false;
    for (const slot of workout.slots) {
      if (slot.setId === setId) {
        matched = true;
        break;
      }
    }

    if (!matched) {
      nextWorkouts.push(workout);
      continue;
    }

    const nextSlots: Slot[] = [];
    for (let i = 0; i < workout.slots.length; i++) {
      const slot = workout.slots[i]!;
      if (slot.setId === setId) {
        removedSlots.push({ workoutId: workout.id, slotIndex: i, slot: { ...slot } });
      } else {
        nextSlots.push(slot);
      }
    }
    nextWorkouts.push({ ...workout, slots: nextSlots });
  }

  return { nextWorkouts, removedSlots };
}
