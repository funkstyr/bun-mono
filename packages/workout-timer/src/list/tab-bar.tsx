import { useCallback } from "react";

import { cn } from "@bun-mono/core-ui/utils";

import type { TimerAppNavigate, TimerKind } from "../timer-app";

export function TabBar({ kind, onNavigate }: { kind: TimerKind; onNavigate: TimerAppNavigate }) {
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
