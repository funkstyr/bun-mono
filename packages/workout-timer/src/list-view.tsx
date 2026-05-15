import { useMemo } from "react";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@bun-mono/core-ui/card";

import { formatMmSs } from "./format";
import type { SavedTimer } from "./schemas";
import { createTimer, useTimers } from "./use-timers";

export type ListViewProps = {
  onCreate?: (created: SavedTimer) => void;
};

export function ListView({ onCreate }: ListViewProps) {
  const timers = useTimers();

  const sorted = useMemo(() => [...timers].sort((a, b) => b.updatedAt - a.updatedAt), [timers]);

  const handleCreate = () => {
    const created = createTimer();
    onCreate?.(created);
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
            <TimerCard timer={timer} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimerCard({ timer }: { timer: SavedTimer }) {
  const set = timer.sets[0]!;
  const summary = `${set.rounds} rounds · ${formatMmSs(set.workSec)} work / ${formatMmSs(set.restSec)} rest`;
  return (
    <Card>
      <CardContent className="space-y-1">
        <CardTitle className="text-base">{timer.name}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardContent>
    </Card>
  );
}
