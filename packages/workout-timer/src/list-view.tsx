import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@bun-mono/core-ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bun-mono/core-ui/dropdown-menu";
import { toast } from "@bun-mono/core-ui/sonner";
import { MoreVerticalIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { formatMmSs } from "./format";
import type { SavedTimer } from "./schemas";
import type { TimerView } from "./timer-app";
import { deleteTimer, duplicateTimer, restoreTimer, useTimers } from "./use-timers";

export type ListViewProps = {
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

export function ListView({ onNavigate }: ListViewProps) {
  const timers = useTimers();

  const sorted = useMemo(() => timers.toSorted((a, b) => b.updatedAt - a.updatedAt), [timers]);

  const handleCreate = useCallback(() => onNavigate({ view: "edit", timerId: null }), [onNavigate]);

  const handleStart = useCallback(
    (id: string) => onNavigate({ view: "run", timerId: id }),
    [onNavigate],
  );

  const handleEdit = useCallback(
    (id: string) => onNavigate({ view: "edit", timerId: id }),
    [onNavigate],
  );

  const handleDuplicate = useCallback((id: string) => {
    duplicateTimer(id);
  }, []);

  const handleDelete = useCallback((timer: SavedTimer) => {
    const snapshot: SavedTimer = { ...timer, sets: [{ ...timer.sets[0]! }] };
    deleteTimer(timer.id);
    toast(`Deleted "${snapshot.name}"`, {
      action: {
        label: "Undo",
        onClick: () => {
          restoreTimer(snapshot);
        },
      },
    });
  }, []);

  if (sorted.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <CardTitle>No saved timers yet</CardTitle>
            <CardDescription>Create one to get started.</CardDescription>
            <Button onClick={handleCreate}>+ Create</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
      <div className="flex justify-end">
        <Button onClick={handleCreate}>+ Create</Button>
      </div>
      <ul className="space-y-3">
        {sorted.map((timer) => (
          <li key={timer.id}>
            <TimerCard
              timer={timer}
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

function TimerCard({
  timer,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  timer: SavedTimer;
  onStart: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (timer: SavedTimer) => void;
}) {
  const set = timer.sets[0]!;
  const summary = `${set.rounds} rounds · ${formatMmSs(set.activeSec)} active / ${formatMmSs(set.restSec)} rest`;
  const handleStart = useCallback(() => onStart(timer.id), [onStart, timer.id]);
  const handleEdit = useCallback(() => onEdit(timer.id), [onEdit, timer.id]);
  const handleDuplicate = useCallback(() => onDuplicate(timer.id), [onDuplicate, timer.id]);
  const handleDelete = useCallback(() => onDelete(timer), [onDelete, timer]);
  const triggerRender = useMemo(
    () => (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`More actions for ${timer.name}`}
        onClick={stopEvent}
      />
    ),
    [timer.name],
  );
  return (
    <Card className="hover:bg-accent/40 focus-within:ring-ring relative transition-colors focus-within:ring-2">
      <button
        type="button"
        onClick={handleStart}
        className="w-full cursor-pointer bg-transparent text-left focus-visible:outline-none"
        aria-label={`Start ${timer.name}`}
      >
        <CardContent className="space-y-1 pr-10">
          <CardTitle className="text-base">{timer.name}</CardTitle>
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
