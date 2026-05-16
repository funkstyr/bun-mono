import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type } from "arktype";

import { Skeleton } from "@bun-mono/core-ui/skeleton";
import { TimerApp, type TimerKind, type TimerView } from "@bun-mono/workout-timer/timer-app";

const timerSearchSchema = type({
  "view?": "'list' | 'edit' | 'run' | undefined",
  "kind?": "'set' | 'workout' | undefined",
  "id?": "string | undefined",
});

export const Route = createFileRoute("/timer")({
  component: RouteComponent,
  validateSearch: (search) => {
    const parsed = timerSearchSchema(search);
    if (parsed instanceof type.errors) {
      return {
        view: "list" as TimerView,
        kind: "set" as TimerKind,
        id: undefined as string | undefined,
      };
    }
    return {
      view: (parsed.view ?? "list") as TimerView,
      kind: (parsed.kind ?? "set") as TimerKind,
      id: parsed.id,
    };
  },
});

function RouteComponent() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/timer" });
  const [mounted, setMounted] = useState(false);

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

  if (!mounted) {
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
      kind={search.kind}
      id={search.id ?? null}
      onNavigate={handleNavigate}
    />
  );
}
