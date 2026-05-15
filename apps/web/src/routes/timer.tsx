import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type } from "arktype";
import { useEffect, useState } from "react";

import { Skeleton } from "@bun-mono/core-ui/skeleton";
import { TimerApp, type TimerView } from "@bun-mono/workout-timer/timer-app";

const timerSearchSchema = type({
  "view?": "'list' | 'edit' | 'run' | undefined",
  "timerId?": "string | undefined",
});

export const Route = createFileRoute("/timer")({
  component: RouteComponent,
  validateSearch: (search) => {
    const parsed = timerSearchSchema(search);
    if (parsed instanceof type.errors) {
      return { view: "list" as TimerView, timerId: undefined as string | undefined };
    }
    return {
      view: (parsed.view ?? "list") as TimerView,
      timerId: parsed.timerId,
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

  if (!mounted) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-72" />
      </div>
    );
  }

  return (
    <TimerApp
      view={search.view}
      timerId={search.timerId ?? null}
      onNavigate={(next) => {
        void navigate({
          to: "/timer",
          search: () => ({
            view: next.view,
            timerId: next.timerId ?? undefined,
          }),
        });
      }}
    />
  );
}
