import { useCallback } from "react";
import { useForm } from "@tanstack/react-form";

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
import type { SetConfig } from "../schemas";
import { createSet, updateSet } from "../use-timers";
import {
  composedActiveError,
  composedRestError,
  validateActiveMin,
  validateActiveSecRem,
  validateName,
  validatePrepSec,
  validateRestMin,
  validateRestSecRem,
  validateRounds,
} from "./validators";

export type EditorInitialValues = {
  id?: string;
  name: string;
  config: SetConfig;
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
  const active = splitSec(initial.config.activeSec);
  const rest = splitSec(initial.config.restSec);
  return {
    name: initial.name,
    rounds: initial.config.rounds,
    prepSec: initial.config.prepSec,
    activeMin: active.min,
    activeSecRem: active.sec,
    restMin: rest.min,
    restSecRem: rest.sec,
  };
};

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

export function EditorSheet({ open, onClose, initialValues }: EditorSheetProps) {
  const isEdit = Boolean(initialValues?.id);

  const form = useForm({
    defaultValues: defaultEditorValues(initialValues),
    onSubmit: ({ value }) => {
      const config: SetConfig = {
        rounds: value.rounds,
        prepSec: value.prepSec,
        activeSec: value.activeMin * 60 + value.activeSecRem,
        restSec: value.restMin * 60 + value.restSecRem,
      };

      const name = value.name.trim();
      if (isEdit && initialValues?.id) {
        updateSet(initialValues.id, { name, config });
      } else {
        createSet({ name, config });
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
          <DialogTitle>{isEdit ? "Edit set" : "New set"}</DialogTitle>
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
