import { useCallback } from "react";
import { useForm } from "@tanstack/react-form";
import { type } from "arktype";
import { MinusIcon, PlusIcon } from "lucide-react";

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

import {
  minutesSchema,
  nameSchema,
  prepSecSchema,
  restSecSchema,
  roundsSchema,
  secondsRemSchema,
  activeSecSchema,
  type SetConfig,
} from "./schemas";
import { createTimer, updateTimer } from "./use-timers";

export type EditorInitialValues = {
  id?: string;
  name: string;
  set: SetConfig;
};

export type EditorSheetProps = {
  open: boolean;
  onClose: () => void;
  initialValues: EditorInitialValues | undefined;
};

type EditorFormValues = {
  name: string;
  rounds: number;
  prepSec: number;
  activeMin: number;
  activeSecRem: number;
  restMin: number;
  restSecRem: number;
};

const splitSec = (totalSec: number) => ({
  min: Math.floor(totalSec / 60),
  sec: totalSec % 60,
});

const defaultEditorValues = (initial?: EditorInitialValues): EditorFormValues => {
  if (!initial) {
    return {
      name: "",
      rounds: 5,
      prepSec: 5,
      activeMin: 0,
      activeSecRem: 30,
      restMin: 0,
      restSecRem: 10,
    };
  }
  const active = splitSec(initial.set.activeSec);
  const rest = splitSec(initial.set.restSec);
  return {
    name: initial.name,
    rounds: initial.set.rounds,
    prepSec: initial.set.prepSec,
    activeMin: active.min,
    activeSecRem: active.sec,
    restMin: rest.min,
    restSecRem: rest.sec,
  };
};

const validateName = ({ value }: { value: string }): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Name is required";
  const result = nameSchema(trimmed);
  if (result instanceof type.errors) return "Name must be between 1 and 60 characters";
  return undefined;
};

const validateRounds = ({ value }: { value: number }): string | undefined => {
  const result = roundsSchema(value);
  if (result instanceof type.errors) return "Rounds must be between 1 and 99";
  return undefined;
};

const validatePrepSec = ({ value }: { value: number }): string | undefined => {
  const result = prepSecSchema(value);
  if (result instanceof type.errors) return "Prep must be between 0 and 60 seconds";
  return undefined;
};

const validateMinutes =
  (label: string) =>
  ({ value }: { value: number }): string | undefined => {
    const result = minutesSchema(value);
    if (result instanceof type.errors) return `${label} minutes must be between 0 and 60`;
    return undefined;
  };

const validateSecondsRem =
  (label: string) =>
  ({ value }: { value: number }): string | undefined => {
    const result = secondsRemSchema(value);
    if (result instanceof type.errors) return `${label} seconds must be between 0 and 59`;
    return undefined;
  };

const composedActiveError = (activeMin: number, activeSecRem: number): string | undefined => {
  const total = activeMin * 60 + activeSecRem;
  const result = activeSecSchema(total);
  if (result instanceof type.errors) return "Active duration must be between 0:01 and 60:00";
  return undefined;
};

const composedRestError = (restMin: number, restSecRem: number): string | undefined => {
  const total = restMin * 60 + restSecRem;
  const result = restSecSchema(total);
  if (result instanceof type.errors) return "Rest duration must be between 0:00 and 60:00";
  return undefined;
};

const validateActiveMin = validateMinutes("Active");
const validateActiveSecRem = validateSecondsRem("Active");
const validateRestMin = validateMinutes("Rest");
const validateRestSecRem = validateSecondsRem("Rest");

const nameValidators = { onChange: validateName, onBlur: validateName };
const roundsValidators = { onChange: validateRounds };
const prepSecValidators = { onChange: validatePrepSec };
const activeMinValidators = { onChange: validateActiveMin };
const activeSecRemValidators = { onChange: validateActiveSecRem };
const restMinValidators = { onChange: validateRestMin };
const restSecRemValidators = { onChange: validateRestSecRem };

const activeComposedSelector = (s: { values: { activeMin: number; activeSecRem: number } }) =>
  [s.values.activeMin, s.values.activeSecRem] as const;

const restComposedSelector = (s: { values: { restMin: number; restSecRem: number } }) =>
  [s.values.restMin, s.values.restSecRem] as const;

const submitSelector = (s: {
  canSubmit: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
  values: { activeMin: number; activeSecRem: number; restMin: number; restSecRem: number };
}) => ({
  canSubmit: s.canSubmit,
  isDirty: s.isDirty,
  isSubmitting: s.isSubmitting,
  activeMin: s.values.activeMin,
  activeSecRem: s.values.activeSecRem,
  restMin: s.values.restMin,
  restSecRem: s.values.restSecRem,
});

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

const firstStringError = (errors: ReadonlyArray<unknown>): string | undefined =>
  errors.find((m): m is string => typeof m === "string");

export function EditorSheet({ open, onClose, initialValues }: EditorSheetProps) {
  const isEdit = Boolean(initialValues?.id);

  const form = useForm({
    defaultValues: defaultEditorValues(initialValues),
    onSubmit: ({ value }) => {
      const set: SetConfig = {
        rounds: value.rounds,
        prepSec: value.prepSec,
        activeSec: value.activeMin * 60 + value.activeSecRem,
        restSec: value.restMin * 60 + value.restSecRem,
      };
      const name = value.name.trim();
      if (isEdit && initialValues?.id) {
        updateTimer(initialValues.id, { name, set });
      } else {
        createTimer({ name, set });
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit timer" : "New timer"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <form.Field name="name" validators={nameValidators}>
            {(field) => <NameTextField field={field} />}
          </form.Field>

          <form.Field name="rounds" validators={roundsValidators}>
            {(field) => {
              const errorMsg = firstStringError(field.state.meta.errors);
              return (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>Rounds</Label>
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

          <div className="space-y-1.5">
            <Label>Active</Label>
            <div className="flex items-end gap-3">
              <form.Field name="activeMin" validators={activeMinValidators}>
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={field.name}
                      className="text-muted-foreground text-[10px] tracking-wide uppercase"
                    >
                      Min
                    </Label>
                    <NumericStepper
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      step={1}
                      min={0}
                      max={60}
                      ariaInvalid={Boolean(firstStringError(field.state.meta.errors))}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="activeSecRem" validators={activeSecRemValidators}>
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={field.name}
                      className="text-muted-foreground text-[10px] tracking-wide uppercase"
                    >
                      Sec
                    </Label>
                    <NumericStepper
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      step={5}
                      min={0}
                      max={59}
                      ariaInvalid={Boolean(firstStringError(field.state.meta.errors))}
                    />
                  </div>
                )}
              </form.Field>
            </div>
            <form.Subscribe selector={activeComposedSelector}>
              {([m, sec]) => <FieldError message={composedActiveError(m, sec)} />}
            </form.Subscribe>
          </div>

          <div className="space-y-1.5">
            <Label>Rest</Label>
            <div className="flex items-end gap-3">
              <form.Field name="restMin" validators={restMinValidators}>
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={field.name}
                      className="text-muted-foreground text-[10px] tracking-wide uppercase"
                    >
                      Min
                    </Label>
                    <NumericStepper
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      step={1}
                      min={0}
                      max={60}
                      ariaInvalid={Boolean(firstStringError(field.state.meta.errors))}
                    />
                  </div>
                )}
              </form.Field>
              <form.Field name="restSecRem" validators={restSecRemValidators}>
                {(field) => (
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor={field.name}
                      className="text-muted-foreground text-[10px] tracking-wide uppercase"
                    >
                      Sec
                    </Label>
                    <NumericStepper
                      id={field.name}
                      value={field.state.value}
                      onChange={field.handleChange}
                      onBlur={field.handleBlur}
                      step={5}
                      min={0}
                      max={59}
                      ariaInvalid={Boolean(firstStringError(field.state.meta.errors))}
                    />
                  </div>
                )}
              </form.Field>
            </div>
            <form.Subscribe selector={restComposedSelector}>
              {([m, sec]) => <FieldError message={composedRestError(m, sec)} />}
            </form.Subscribe>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <form.Subscribe selector={submitSelector}>
              {(state) => {
                const composedInvalid =
                  composedActiveError(state.activeMin, state.activeSecRem) !== undefined ||
                  composedRestError(state.restMin, state.restSecRem) !== undefined;
                const disabled =
                  !state.canSubmit || !state.isDirty || state.isSubmitting || composedInvalid;
                return (
                  <Button type="submit" size="sm" disabled={disabled}>
                    {state.isSubmitting ? "Saving..." : "Save"}
                  </Button>
                );
              }}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
