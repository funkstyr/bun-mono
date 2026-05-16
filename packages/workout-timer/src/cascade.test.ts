import { describe, expect, it } from "vitest";

import { cascadeDeleteSet } from "./cascade";
import type { SavedWorkout, Slot } from "./schemas";

function makeWorkout(id: string, slots: ReadonlyArray<string>): SavedWorkout {
  return {
    id,
    name: id,
    createdAt: 0,
    updatedAt: 0,
    prepSec: 10,
    repeats: 1,
    slots: slots.map((setId) => ({ setId })),
  };
}

describe("cascadeDeleteSet", () => {
  it("returns the input array unchanged (reference-equal entries) when no workout references the setId", () => {
    const w1 = makeWorkout("w1", ["a", "b"]);
    const w2 = makeWorkout("w2", ["c"]);
    const workouts = [w1, w2];
    const result = cascadeDeleteSet(workouts, "missing");
    expect(result.removedSlots).toEqual([]);
    expect(result.nextWorkouts).toHaveLength(2);
    expect(result.nextWorkouts[0]).toBe(w1);
    expect(result.nextWorkouts[1]).toBe(w2);
  });

  it("removes a single slot from one workout, leaves others unaffected by reference", () => {
    const w1 = makeWorkout("w1", ["a", "target", "b"]);
    const w2 = makeWorkout("w2", ["c"]);
    const workouts = [w1, w2];

    const { nextWorkouts, removedSlots } = cascadeDeleteSet(workouts, "target");

    expect(nextWorkouts).toHaveLength(2);
    expect(nextWorkouts[0]).not.toBe(w1);
    expect(nextWorkouts[0]!.slots).toEqual<Slot[]>([{ setId: "a" }, { setId: "b" }]);
    expect(nextWorkouts[1]).toBe(w2);
    expect(removedSlots).toEqual([{ workoutId: "w1", slotIndex: 1, slot: { setId: "target" } }]);
  });

  it("removes multiple matching slots from one workout, in original slotIndex order", () => {
    const w1 = makeWorkout("w1", ["target", "a", "target", "b", "target"]);
    const { nextWorkouts, removedSlots } = cascadeDeleteSet([w1], "target");

    expect(nextWorkouts[0]!.slots).toEqual<Slot[]>([{ setId: "a" }, { setId: "b" }]);
    expect(removedSlots).toEqual([
      { workoutId: "w1", slotIndex: 0, slot: { setId: "target" } },
      { workoutId: "w1", slotIndex: 2, slot: { setId: "target" } },
      { workoutId: "w1", slotIndex: 4, slot: { setId: "target" } },
    ]);

    const restored = [...nextWorkouts[0]!.slots];
    for (const r of removedSlots) restored.splice(r.slotIndex, 0, r.slot);
    expect(restored).toEqual(w1.slots);
  });

  it("cascades across multiple workouts; emits removedSlots in workout-list order, slotIndex order within each", () => {
    const w1 = makeWorkout("w1", ["a", "target"]);
    const w2 = makeWorkout("w2", ["target", "b", "target"]);
    const w3 = makeWorkout("w3", ["c"]);
    const { nextWorkouts, removedSlots } = cascadeDeleteSet([w1, w2, w3], "target");

    expect(nextWorkouts[0]!.slots).toEqual<Slot[]>([{ setId: "a" }]);
    expect(nextWorkouts[1]!.slots).toEqual<Slot[]>([{ setId: "b" }]);
    expect(nextWorkouts[2]).toBe(w3);

    expect(removedSlots).toEqual([
      { workoutId: "w1", slotIndex: 1, slot: { setId: "target" } },
      { workoutId: "w2", slotIndex: 0, slot: { setId: "target" } },
      { workoutId: "w2", slotIndex: 2, slot: { setId: "target" } },
    ]);
  });

  it("leaves a workout with slots: [] when its only slot referenced the setId (no auto-delete)", () => {
    const w1 = makeWorkout("w1", ["target"]);
    const { nextWorkouts, removedSlots } = cascadeDeleteSet([w1], "target");

    expect(nextWorkouts).toHaveLength(1);
    expect(nextWorkouts[0]!.id).toBe("w1");
    expect(nextWorkouts[0]!.slots).toEqual([]);
    expect(removedSlots).toEqual([{ workoutId: "w1", slotIndex: 0, slot: { setId: "target" } }]);
  });

  it("does not mutate the input workouts", () => {
    const w1 = makeWorkout("w1", ["target", "a"]);
    const original = JSON.parse(JSON.stringify(w1));
    cascadeDeleteSet([w1], "target");
    expect(w1).toEqual(original);
  });
});
