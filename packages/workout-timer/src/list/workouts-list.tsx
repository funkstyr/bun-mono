import { useCallback, useMemo } from "react";
import { MoreVerticalIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@bun-mono/core-ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bun-mono/core-ui/dropdown-menu";
import { toast } from "@bun-mono/core-ui/sonner";

import { computeWorkoutDuration, formatMmSs } from "../format";
import type { SavedSet, SavedWorkout } from "../schemas";
import type { TimerAppNavigate } from "../timer-app";
import {
  deleteWorkout,
  duplicateWorkout,
  restoreWorkout,
  useTimers,
  useWorkouts,
} from "../use-timers";
import { stopEvent } from "./list-utils";

export function WorkoutsList({ onNavigate }: { onNavigate: TimerAppNavigate }) {
  const workouts = useWorkouts();
  const sets = useTimers();

  const setsById = useMemo(() => {
    const map = new Map<string, SavedSet>();
    for (const set of sets) map.set(set.id, set);
    return map;
  }, [sets]);

  const sorted = useMemo(() => workouts.toSorted((a, b) => b.updatedAt - a.updatedAt), [workouts]);

  const handleBuild = useCallback(
    () => onNavigate({ view: "edit", kind: "workout", id: null }),
    [onNavigate],
  );

  const handleEdit = useCallback(
    (id: string) => onNavigate({ view: "edit", kind: "workout", id }),
    [onNavigate],
  );

  const handleStart = useCallback(
    (id: string) => onNavigate({ view: "run", kind: "workout", id }),
    [onNavigate],
  );

  const handleDuplicate = useCallback((id: string) => {
    duplicateWorkout(id);
  }, []);

  const handleDelete = useCallback((workout: SavedWorkout) => {
    const snapshot: SavedWorkout = {
      ...workout,
      slots: workout.slots.map((s) => ({ ...s })),
    };

    deleteWorkout(workout.id);
    toast(`Deleted "${snapshot.name}"`, {
      action: {
        label: "Undo",
        onClick: () => {
          restoreWorkout(snapshot);
        },
      },
    });
  }, []);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <CardTitle>No workouts yet</CardTitle>
          <CardDescription>Build one to chain your sets together.</CardDescription>
          <Button onClick={handleBuild}>Build a workout</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleBuild}>+ Build</Button>
      </div>

      <ul className="space-y-3">
        {sorted.map((workout) => (
          <li key={workout.id}>
            <WorkoutCard
              workout={workout}
              setsById={setsById}
              onStart={handleStart}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkoutCard({
  workout,
  setsById,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  workout: SavedWorkout;
  setsById: Map<string, SavedSet>;
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (workout: SavedWorkout) => void;
}) {
  const resolved = useMemo(
    () => workout.slots.map((slot) => setsById.get(slot.setId)),
    [workout.slots, setsById],
  );

  const durationMs = useMemo(() => computeWorkoutDuration(workout, resolved), [workout, resolved]);
  const summary = `${workout.slots.length} sets · ${workout.repeats} passes · ~${formatMmSs(Math.round(durationMs / 1000))}`;

  const handleStart = useCallback(() => onStart(workout.id), [onStart, workout.id]);
  const handleEdit = useCallback(() => onEdit(workout.id), [onEdit, workout.id]);
  const handleDuplicate = useCallback(() => onDuplicate(workout.id), [onDuplicate, workout.id]);
  const handleDelete = useCallback(() => onDelete(workout), [onDelete, workout]);

  const triggerRender = useMemo(
    () => (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`More actions for ${workout.name}`}
        onClick={stopEvent}
      />
    ),
    [workout.name],
  );

  return (
    <Card className="hover:bg-accent/40 focus-within:ring-ring relative transition-colors focus-within:ring-2">
      <button
        type="button"
        onClick={handleStart}
        className="w-full cursor-pointer bg-transparent text-left focus-visible:outline-none"
        aria-label={`Start ${workout.name}`}
      >
        <CardContent className="space-y-1 pr-10">
          <CardTitle className="text-base">{workout.name}</CardTitle>
          <CardDescription>{summary}</CardDescription>
        </CardContent>
      </button>

      <div className="absolute top-2 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger render={triggerRender}>
            <MoreVerticalIcon />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={handleDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
