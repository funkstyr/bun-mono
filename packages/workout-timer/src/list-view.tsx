import { MoreVerticalIcon } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@bun-mono/core-ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bun-mono/core-ui/dropdown-menu";
import { toast } from "@bun-mono/core-ui/sonner";

import { formatMmSs } from "./format";
import type { SavedTimer } from "./schemas";
import type { TimerView } from "./timer-app";
import { deleteTimer, duplicateTimer, restoreTimer, useTimers } from "./use-timers";

export type ListViewProps = {
  onNavigate: (next: { view: TimerView; timerId: string | null }) => void;
};

export function ListView({ onNavigate }: ListViewProps) {
  const timers = useTimers();

  const sorted = useMemo(() => [...timers].sort((a, b) => b.updatedAt - a.updatedAt), [timers]);

  const handleCreate = () => onNavigate({ view: "edit", timerId: null });

  const handleEdit = (id: string) => onNavigate({ view: "edit", timerId: id });

  const handleDuplicate = (id: string) => {
    duplicateTimer(id);
  };

  const handleDelete = (timer: SavedTimer) => {
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
  };

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
    <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleCreate}>+ Create</Button>
      </div>
      <ul className="space-y-3">
        {sorted.map((timer) => (
          <li key={timer.id}>
            <TimerCard
              timer={timer}
              onStart={() => onNavigate({ view: "run", timerId: timer.id })}
              onEdit={() => handleEdit(timer.id)}
              onDuplicate={() => handleDuplicate(timer.id)}
              onDelete={() => handleDelete(timer)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimerCard({
  timer,
  onStart,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  timer: SavedTimer;
  onStart: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const set = timer.sets[0]!;
  const summary = `${set.rounds} rounds · ${formatMmSs(set.activeSec)} active / ${formatMmSs(set.restSec)} rest`;
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onStart}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onStart();
        }
      }}
      className="relative cursor-pointer transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={`Start ${timer.name}`}
    >
      <CardContent className="space-y-1 pr-10">
        <CardTitle className="text-base">{timer.name}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardContent>
      <div className="absolute right-2 top-2" onClick={stop} onKeyDown={stop}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ${timer.name}`}
                onClick={stop}
              />
            }
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
