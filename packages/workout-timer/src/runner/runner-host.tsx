import { useEffect, useRef, useState } from "react";

import { toast } from "@bun-mono/core-ui/sonner";

import type { SavedSet, SavedWorkout } from "../schemas";
import type { TimerAppNavigate } from "../timer-app";
import { useTimers, useWorkouts } from "../use-timers";
import { RunnerView } from "./runner-view";

export type RunnerHostProps = {
  setId: string;
  onNavigate: TimerAppNavigate;
};

export function RunnerHost({ setId, onNavigate }: RunnerHostProps) {
  const sets = useTimers();
  const [snapshot] = useState<SavedSet | null>(() => sets.find((s) => s.id === setId) ?? null);

  useEffect(() => {
    if (!snapshot) onNavigate({ view: "list", kind: "set", id: null });
  }, [snapshot, onNavigate]);

  if (!snapshot) return null;
  return <RunnerView kind="set" set={snapshot} onNavigate={onNavigate} />;
}

export type WorkoutRunnerHostProps = {
  workoutId: string;
  onNavigate: TimerAppNavigate;
};

type WorkoutSnapshot = { workout: SavedWorkout; resolvedSets: SavedSet[] };

export function WorkoutRunnerHost({ workoutId, onNavigate }: WorkoutRunnerHostProps) {
  const workouts = useWorkouts();
  const sets = useTimers();

  const [snapshot] = useState<WorkoutSnapshot | null>(() => {
    const workout = workouts.find((w) => w.id === workoutId);
    if (!workout) return null;

    const resolved: SavedSet[] = [];

    for (const slot of workout.slots) {
      const found = sets.find((s) => s.id === slot.setId);
      if (!found) return null;

      resolved.push(found);
    }

    if (resolved.length === 0) return null;
    return { workout, resolvedSets: resolved };
  });
  const failedRef = useRef(false);

  useEffect(() => {
    if (snapshot) return;
    if (failedRef.current) return;

    failedRef.current = true;
    toast.error("Couldn't start workout — a referenced set is missing.");
    onNavigate({ view: "list", kind: "workout", id: null });
  }, [snapshot, onNavigate]);

  if (!snapshot) return null;
  return (
    <RunnerView
      kind="workout"
      workout={snapshot.workout}
      resolvedSets={snapshot.resolvedSets}
      onNavigate={onNavigate}
    />
  );
}
