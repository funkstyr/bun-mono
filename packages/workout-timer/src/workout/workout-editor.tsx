import { useCallback, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useForm } from "@tanstack/react-form";
import { type } from "arktype";
import { PlusIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bun-mono/core-ui/dialog";
import { Label } from "@bun-mono/core-ui/label";

import { FieldError } from "../form/field-error";
import { firstStringError } from "../form/form-utils";
import { NameTextField } from "../form/name-text-field";
import { NumericStepper } from "../form/numeric-stepper";
import { nameSchema, prepSecSchema, repeatsSchema, type SavedSet, type Slot } from "../schemas";
import type { TimerAppNavigate } from "../timer-app";
import { createWorkout, updateWorkout, useTimers, useWorkouts } from "../use-timers";
import { SetPicker } from "./set-picker";
import {
  makeUid,
  SlotEmptyState,
  SortableSlotRow,
  type SlotDraft,
  slotsToDraft,
} from "./slot-list";

export type WorkoutEditorProps = {
  id: string | null;
  onClose: () => void;
  onNavigate: TimerAppNavigate;
};

type EditorFormValues = {
  name: string;
  prepSec: number;
  repeats: number;
};

const validateName = ({ value }: { value: string }): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Name is required";

  const result = nameSchema(trimmed);
  if (result instanceof type.errors) return "Name must be between 1 and 60 characters";

  return undefined;
};

const validatePrepSec = ({ value }: { value: number }): string | undefined => {
  const result = prepSecSchema(value);
  if (result instanceof type.errors) return "Prep must be between 0 and 60 seconds";

  return undefined;
};

const validateRepeats = ({ value }: { value: number }): string | undefined => {
  const result = repeatsSchema(value);
  if (result instanceof type.errors) return "Repeats must be between 1 and 99";

  return undefined;
};

const nameValidators = { onChange: validateName, onBlur: validateName };
const prepSecValidators = { onChange: validatePrepSec };
const repeatsValidators = { onChange: validateRepeats };

const submitSelector = (s: { canSubmit: boolean; isSubmitting: boolean }) => ({
  canSubmit: s.canSubmit,
  isSubmitting: s.isSubmitting,
});

const dragActivationConstraint = { distance: 4 };
const touchActivationConstraint = { delay: 150, tolerance: 8 };

export function WorkoutEditor({ id, onClose, onNavigate }: WorkoutEditorProps) {
  const workouts = useWorkouts();
  const sets = useTimers();

  const existing = useMemo(
    () => (id ? (workouts.find((w) => w.id === id) ?? null) : null),
    [id, workouts],
  );
  const isEdit = existing !== null;

  const [slotDrafts, setSlotDrafts] = useState<SlotDraft[]>(() =>
    slotsToDraft(existing?.slots ?? []),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const setsById = useMemo(() => {
    const map = new Map<string, SavedSet>();
    for (const set of sets) map.set(set.id, set);
    return map;
  }, [sets]);

  const sortedSets = useMemo(() => sets.toSorted((a, b) => b.updatedAt - a.updatedAt), [sets]);

  const defaultValues: EditorFormValues = {
    name: existing?.name ?? "",
    prepSec: existing?.prepSec ?? 10,
    repeats: existing?.repeats ?? 1,
  };

  const form = useForm({
    defaultValues,
    onSubmit: ({ value }) => {
      const slots: Slot[] = slotDrafts
        .filter((d) => setsById.has(d.setId))
        .map((d) => ({ setId: d.setId }));
      const name = value.name.trim();
      if (isEdit && existing) {
        updateWorkout(existing.id, {
          name,
          prepSec: value.prepSec,
          repeats: value.repeats,
          slots,
        });
      } else {
        createWorkout({
          name,
          prepSec: value.prepSec,
          repeats: value.repeats,
          slots,
        });
      }
      onClose();
    },
  });

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void form.handleSubmit();
    },
    [form],
  );

  const handleRemoveSlot = useCallback((uid: string) => {
    setSlotDrafts((prev) => prev.filter((s) => s.uid !== uid));
  }, []);

  const handleAddSetFromPicker = useCallback((setId: string) => {
    setSlotDrafts((prev) => [...prev, { uid: makeUid(), setId }]);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: dragActivationConstraint }),
    useSensor(TouchSensor, { activationConstraint: touchActivationConstraint }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSlotDrafts((prev) => {
      const oldIdx = prev.findIndex((s) => s.uid === active.id);
      const newIdx = prev.findIndex((s) => s.uid === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;

      return arrayMove(prev, oldIdx, newIdx);
    });
  }, []);

  const handleGoCreateSet = useCallback(() => {
    onNavigate({ view: "edit", kind: "set", id: null });
  }, [onNavigate]);

  const handleOpenPicker = useCallback(() => setPickerOpen(true), []);
  const handleClosePicker = useCallback(() => setPickerOpen(false), []);

  const slotItemIds = useMemo(() => slotDrafts.map((s) => s.uid), [slotDrafts]);
  const hasMissing = slotDrafts.some((s) => !setsById.has(s.setId));
  const hasSlots = slotDrafts.length > 0;
  const slotsValid = hasSlots && !hasMissing && slotDrafts.length <= 50;

  return (
    <>
      <Dialog open onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit workout" : "New workout"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <form.Field name="name" validators={nameValidators}>
              {(field) => <NameTextField field={field} />}
            </form.Field>

            <form.Field name="prepSec" validators={prepSecValidators}>
              {(field) => {
                const errorMsg = firstStringError(field.state.meta.errors);

                return (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>Prep (seconds)</Label>
                    <NumericStepper
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      step={5}
                      min={0}
                      max={60}
                      ariaInvalid={Boolean(errorMsg)}
                    />
                    <FieldError message={errorMsg} />
                  </div>
                );
              }}
            </form.Field>

            <form.Field name="repeats" validators={repeatsValidators}>
              {(field) => {
                const errorMsg = firstStringError(field.state.meta.errors);

                return (
                  <div className="space-y-1.5">
                    <Label htmlFor={field.name}>Repeats</Label>
                    <NumericStepper
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      step={1}
                      min={1}
                      max={99}
                      ariaInvalid={Boolean(errorMsg)}
                    />
                    <FieldError message={errorMsg} />
                  </div>
                );
              }}
            </form.Field>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Sets</Label>
                {hasSlots ? (
                  <span className="text-muted-foreground text-xs">{slotDrafts.length}/50</span>
                ) : null}
              </div>

              {hasSlots ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={slotItemIds} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                      {slotDrafts.map((slot) => (
                        <SortableSlotRow
                          key={slot.uid}
                          slot={slot}
                          set={setsById.get(slot.setId)}
                          onRemove={handleRemoveSlot}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <SlotEmptyState hasAnySets={sets.length > 0} onCreateFirstSet={handleGoCreateSet} />
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPicker}
                disabled={sets.length === 0 || slotDrafts.length >= 50}
                className="w-full"
              >
                <PlusIcon /> Add set
              </Button>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>

              <form.Subscribe selector={submitSelector}>
                {(state) => (
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!state.canSubmit || state.isSubmitting || !slotsValid}
                  >
                    {state.isSubmitting ? "Saving..." : "Save"}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {pickerOpen ? (
        <SetPicker sets={sortedSets} onPick={handleAddSetFromPicker} onClose={handleClosePicker} />
      ) : null}
    </>
  );
}
