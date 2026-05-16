import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type } from "arktype";

import { Skeleton } from "@bun-mono/core-ui/skeleton";
import { TimerApp, type TimerKind, type TimerView } from "@bun-mono/workout-timer/timer-app";
import { useTimers, useWorkouts } from "@bun-mono/workout-timer/use-timers";

const timerSearchSchema = type({
  "view?": "'list' | 'edit' | 'run' | undefined",
  "kind?": "'set' | 'workout' | undefined",
  "id?": "string | undefined",
});

type TimerSearch = {
  view: TimerView;
  kind: TimerKind | undefined;
  id: string | undefined;
};

export const Route = createFileRoute("/timer")({
  component: RouteComponent,
  validateSearch: (search): TimerSearch => {
    const parsed = timerSearchSchema(search);
    if (parsed instanceof type.errors) {
      return { view: "list", kind: undefined, id: undefined };
    }
    return {
      view: (parsed.view ?? "list") as TimerView,
      kind: parsed.kind,
      id: parsed.id,
    };
  },
});

function pickDefaultKind(workoutsLen: number, setsLen: number): TimerKind {
  if (workoutsLen > 0) return "workout";
  if (setsLen > 0) return "set";
  return "workout";
}

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/timer" });
  const [mounted, setMounted] = useState(false);
  const sets = useTimers();
  const workouts = useWorkouts();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNavigate = useCallback(
    (next: { view: TimerView; kind: TimerKind; id: string | null }) => {
      void navigate({
        to: "/timer",
        search: () => ({
          view: next.view,
          kind: next.kind,
          id: next.id ?? undefined,
        }),
      });
    },
    [navigate],
  );

  const resolvedKind: TimerKind | null = mounted
    ? (search.kind ?? pickDefaultKind(workouts.length, sets.length))
    : null;

  useEffect(() => {
    if (!mounted) return;
    if (search.kind !== undefined) return;
    if (resolvedKind === null) return;
    void navigate({
      to: "/timer",
      replace: true,
      search: () => ({
        view: search.view,
        kind: resolvedKind,
        id: search.id,
      }),
    });
  }, [mounted, search.kind, search.view, search.id, resolvedKind, navigate]);

  if (!mounted || resolvedKind === null) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-72" />
      </div>
    );
  }

  return (
    <TimerApp
      view={search.view}
      kind={resolvedKind}
      id={search.id ?? null}
      onNavigate={handleNavigate}
    />
  );
}
