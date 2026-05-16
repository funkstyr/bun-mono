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
import { cn } from "@bun-mono/core-ui/utils";

import { computeWorkoutDuration, formatMmSs } from "./format";
import type { SavedSet, SavedWorkout } from "./schemas";
import type { TimerAppNavigate, TimerKind } from "./timer-app";
import {
  deleteSet,
  deleteWorkout,
  duplicateSet,
  duplicateWorkout,
  restoreSet,
  restoreWorkout,
  useTimers,
  useWorkouts,
} from "./use-timers";

export type ListViewProps = {
  kind: TimerKind;
  onNavigate: TimerAppNavigate;
};

export function ListView({ kind, onNavigate }: ListViewProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
      <TabBar kind={kind} onNavigate={onNavigate} />
      {kind === "workout" ? (
        <WorkoutsList onNavigate={onNavigate} />
      ) : (
        <SetsList onNavigate={onNavigate} />
      )}
    </div>
  );
}

function TabBar({ kind, onNavigate }: { kind: TimerKind; onNavigate: TimerAppNavigate }) {
  const goWorkouts = useCallback(
    () => onNavigate({ view: "list", kind: "workout", id: null }),
    [onNavigate],
  );
  const goSets = useCallback(
    () => onNavigate({ view: "list", kind: "set", id: null }),
    [onNavigate],
  );
  return (
    <div role="tablist" aria-label="Timer library" className="flex border-b">
      <TabButton selected={kind === "workout"} onClick={goWorkouts}>
        Workouts
      </TabButton>
      <TabButton selected={kind === "set"} onClick={goSets}>
        Sets
      </TabButton>
    </div>
  );
}

function TabButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "-mb-px cursor-pointer border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        selected
          ? "border-foreground text-foreground"
          : "text-muted-foreground hover:text-foreground border-transparent",
      )}
    >
      {children}
    </button>
  );
}

function WorkoutsList({ onNavigate }: { onNavigate: TimerAppNavigate }) {
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

function SetsList({ onNavigate }: { onNavigate: TimerAppNavigate }) {
  const sets = useTimers();
  const workouts = useWorkouts();

  const sorted = useMemo(() => sets.toSorted((a, b) => b.updatedAt - a.updatedAt), [sets]);

  const usedByCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const workout of workouts) {
      const seen = new Set<string>();
      for (const slot of workout.slots) {
        if (seen.has(slot.setId)) continue;
        seen.add(slot.setId);
        counts.set(slot.setId, (counts.get(slot.setId) ?? 0) + 1);
      }
    }
    return counts;
  }, [workouts]);

  const handleCreate = useCallback(
    () => onNavigate({ view: "edit", kind: "set", id: null }),
    [onNavigate],
  );

  const handleStart = useCallback(
    (id: string) => onNavigate({ view: "run", kind: "set", id }),
    [onNavigate],
  );

  const handleEdit = useCallback(
    (id: string) => onNavigate({ view: "edit", kind: "set", id }),
    [onNavigate],
  );

  const handleDuplicate = useCallback((id: string) => {
    duplicateSet(id);
  }, []);

  const handleDelete = useCallback((set: SavedSet) => {
    const result = deleteSet(set.id);
    if (!result) return;
    const { removedSet, removedSlots } = result;
    const distinctWorkouts = new Set(removedSlots.map((r) => r.workoutId)).size;
    const message =
      distinctWorkouts > 0
        ? `Deleted "${removedSet.name}" (removed from ${distinctWorkouts} workout${distinctWorkouts === 1 ? "" : "s"})`
        : `Deleted "${removedSet.name}"`;
    toast(message, {
      action: {
        label: "Undo",
        onClick: () => {
          restoreSet(removedSet, removedSlots);
        },
      },
    });
  }, []);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <CardTitle>No saved sets yet</CardTitle>
          <CardDescription>Create one to get started.</CardDescription>
          <Button onClick={handleCreate}>+ Create</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreate}>+ Create</Button>
      </div>
      <ul className="space-y-3">
        {sorted.map((set) => (
          <li key={set.id}>
            <SetCard
              set={set}
              usedInCount={usedByCount.get(set.id) ?? 0}
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

const stopEvent = (event: React.SyntheticEvent) => event.stopPropagation();

function SetCard({
  set,
  usedInCount,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  set: SavedSet;
  usedInCount: number;
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (set: SavedSet) => void;
}) {
  const config = set.config;
  const summary = `${config.rounds} rounds · ${formatMmSs(config.activeSec)} active / ${formatMmSs(config.restSec)} rest`;
  const usedInLabel =
    usedInCount > 0 ? `Used in ${usedInCount} workout${usedInCount === 1 ? "" : "s"}` : null;
  const handleStart = useCallback(() => onStart(set.id), [onStart, set.id]);
  const handleEdit = useCallback(() => onEdit(set.id), [onEdit, set.id]);
  const handleDuplicate = useCallback(() => onDuplicate(set.id), [onDuplicate, set.id]);
  const handleDelete = useCallback(() => onDelete(set), [onDelete, set]);
  const triggerRender = useMemo(
    () => (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`More actions for ${set.name}`}
        onClick={stopEvent}
      />
    ),
    [set.name],
  );
  return (
    <Card className="hover:bg-accent/40 focus-within:ring-ring relative transition-colors focus-within:ring-2">
      <button
        type="button"
        onClick={handleStart}
        className="w-full cursor-pointer bg-transparent text-left focus-visible:outline-none"
        aria-label={`Start ${set.name}`}
      >
        <CardContent className="space-y-1 pr-10">
          <CardTitle className="text-base">{set.name}</CardTitle>
          <CardDescription>{summary}</CardDescription>
          {usedInLabel ? <CardDescription>{usedInLabel}</CardDescription> : null}
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
