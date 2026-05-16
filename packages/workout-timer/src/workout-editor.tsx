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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useForm } from "@tanstack/react-form";
import { type } from "arktype";
import { GripVerticalIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@bun-mono/core-ui/dialog";
import { Input } from "@bun-mono/core-ui/input";
import { Label } from "@bun-mono/core-ui/label";
import { cn } from "@bun-mono/core-ui/utils";

import { formatMmSs } from "./format";
import { nameSchema, prepSecSchema, repeatsSchema, type SavedSet, type Slot } from "./schemas";
import type { TimerAppNavigate } from "./timer-app";
import { createWorkout, updateWorkout, useTimers, useWorkouts } from "./use-timers";

export type WorkoutEditorProps = {
  id: string | null;
  onClose: () => void;
  onNavigate: TimerAppNavigate;
};

type SlotDraft = { uid: string; setId: string };

type EditorFormValues = {
  name: string;
  prepSec: number;
  repeats: number;
};

const firstStringError = (errors: ReadonlyArray<unknown>): string | undefined =>
  errors.find((m): m is string => typeof m === "string");

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

function setSummary(set: SavedSet): string {
  const { rounds, activeSec, restSec } = set.config;
  return `${rounds} rounds · ${formatMmSs(activeSec)} / ${formatMmSs(restSec)}`;
}

function makeUid(): string {
  return crypto.randomUUID();
}

function slotsToDraft(slots: ReadonlyArray<Slot>): SlotDraft[] {
  return slots.map((slot) => ({ uid: makeUid(), setId: slot.setId }));
}

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

function NameTextField({
  field,
}: {
  field: {
    name: string;
    state: { value: string; meta: { errors: ReadonlyArray<unknown> } };
    handleBlur: () => void;
    handleChange: (value: string) => void;
  };
}) {
  const errorMsg = firstStringError(field.state.meta.errors);
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
    [field],
  );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name}>Name</Label>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={onChange}
        aria-invalid={errorMsg ? true : undefined}
      />
      <FieldError message={errorMsg} />
    </div>
  );
}

function SortableSlotRow({
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

function SlotEmptyState({
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

function SetPicker({
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

type NumericFieldProps = {
  id: string;
  value: number;
  onChange: (next: number) => void;
  onBlur: () => void;
  step: number;
  min: number;
  max: number;
  disabled?: boolean;
  ariaInvalid?: boolean;
};

function NumericStepper({
  id,
  value,
  onChange,
  onBlur,
  step,
  min,
  max,
  disabled,
  ariaInvalid,
}: NumericFieldProps) {
  const decrement = useCallback(() => {
    onChange(Math.max(min, Math.min(max, value - step)));
  }, [onChange, min, max, value, step]);
  const increment = useCallback(() => {
    onChange(Math.max(min, Math.min(max, value + step)));
  }, [onChange, min, max, value, step]);
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        onChange(Number.NaN);
        return;
      }
      const parsed = Number.parseInt(raw, 10);
      onChange(Number.isNaN(parsed) ? Number.NaN : parsed);
    },
    [onChange],
  );
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={decrement}
        disabled={disabled || value <= min}
        aria-label={`Decrease by ${step}`}
      >
        <MinusIcon />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={handleInputChange}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={ariaInvalid || undefined}
        className="w-16 text-center"
      />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={increment}
        disabled={disabled || value >= max}
        aria-label={`Increase by ${step}`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="text-destructive text-xs" role="alert">
      {message}
    </p>
  );
}
