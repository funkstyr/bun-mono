import { useCallback, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, XIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";
import { cn } from "@bun-mono/core-ui/utils";

import type { SavedSet, Slot } from "../schemas";
import { setSummary } from "./set-summary";

export type SlotDraft = { uid: string; setId: string };

export function makeUid(): string {
  return crypto.randomUUID();
}

export function slotsToDraft(slots: ReadonlyArray<Slot>): SlotDraft[] {
  return slots.map((slot) => ({ uid: makeUid(), setId: slot.setId }));
}

export function SortableSlotRow({
  slot,
  set,
  onRemove,
}: {
  slot: SlotDraft;
  set: SavedSet | undefined;
  onRemove: (uid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: slot.uid,
  });
  const style = useMemo<React.CSSProperties>(
    () => ({
      transform: CSS.Transform.toString(transform),
      transition,
    }),
    [transform, transition],
  );
  const handleRemove = useCallback(() => onRemove(slot.uid), [onRemove, slot.uid]);
  const missing = !set;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-card flex items-center gap-2 rounded-md border px-2 py-2",
        isDragging && "opacity-60",
        missing && "border-destructive/60",
      )}
    >
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      <div className="min-w-0 flex-1">
        {missing ? (
          <p className="text-destructive text-sm">⚠ missing — remove</p>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{set.name}</p>
            <p className="text-muted-foreground truncate text-xs">{setSummary(set)}</p>
          </>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleRemove}
        aria-label="Remove set"
      >
        <XIcon />
      </Button>
    </li>
  );
}

export function SlotEmptyState({
  hasAnySets,
  onCreateFirstSet,
}: {
  hasAnySets: boolean;
  onCreateFirstSet: () => void;
}) {
  return (
    <div className="text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm">
      {hasAnySets ? (
        <p>No sets yet — tap "Add set" below.</p>
      ) : (
        <button
          type="button"
          onClick={onCreateFirstSet}
          className="text-primary cursor-pointer underline-offset-2 hover:underline"
        >
          Create your first set →
        </button>
      )}
    </div>
  );
}
