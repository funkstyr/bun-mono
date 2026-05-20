import { useCallback } from "react";

import { Button } from "@bun-mono/core-ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bun-mono/core-ui/dialog";

import type { SavedSet } from "../schemas";
import { setSummary } from "./set-summary";

function PickerRow({ set, onPick }: { set: SavedSet; onPick: (setId: string) => void }) {
  const handleClick = useCallback(() => onPick(set.id), [onPick, set.id]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="hover:bg-accent w-full cursor-pointer rounded-md border px-3 py-2 text-left transition-colors"
    >
      <p className="text-sm font-medium">{set.name}</p>
      <p className="text-muted-foreground text-xs">{setSummary(set)}</p>
    </button>
  );
}

export function SetPicker({
  sets,
  onPick,
  onClose,
}: {
  sets: ReadonlyArray<SavedSet>;
  onPick: (setId: string) => void;
  onClose: () => void;
}) {
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a set</DialogTitle>
        </DialogHeader>

        {sets.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No sets available yet.</p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {sets.map((set) => (
              <li key={set.id}>
                <PickerRow set={set} onPick={onPick} />
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
