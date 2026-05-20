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

import { formatMmSs } from "../format";
import type { SavedSet } from "../schemas";
import type { TimerAppNavigate } from "../timer-app";
import { deleteSet, duplicateSet, restoreSet, useTimers, useWorkouts } from "../use-timers";
import { stopEvent } from "./list-utils";

export function SetsList({ onNavigate }: { onNavigate: TimerAppNavigate }) {
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
