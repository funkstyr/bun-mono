import { type } from "arktype";

import {
  activeSecSchema,
  minutesSchema,
  nameSchema,
  prepSecSchema,
  restSecSchema,
  roundsSchema,
  secondsRemSchema,
} from "../schemas";

export const validateName = ({ value }: { value: string }): string | undefined => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "Name is required";

  const result = nameSchema(trimmed);
  if (result instanceof type.errors) return "Name must be between 1 and 60 characters";

  return undefined;
};

export const validateRounds = ({ value }: { value: number }): string | undefined => {
  const result = roundsSchema(value);
  if (result instanceof type.errors) return "Rounds must be between 1 and 99";

  return undefined;
};

export const validatePrepSec = ({ value }: { value: number }): string | undefined => {
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

export const validateActiveMin = validateMinutes("Active");
export const validateActiveSecRem = validateSecondsRem("Active");
export const validateRestMin = validateMinutes("Rest");
export const validateRestSecRem = validateSecondsRem("Rest");

export const composedActiveError = (
  activeMin: number,
  activeSecRem: number,
): string | undefined => {
  const total = activeMin * 60 + activeSecRem;
  const result = activeSecSchema(total);
  if (result instanceof type.errors) return "Active duration must be between 0:01 and 60:00";
  return undefined;
};

export const composedRestError = (restMin: number, restSecRem: number): string | undefined => {
  const total = restMin * 60 + restSecRem;
  const result = restSecSchema(total);
  if (result instanceof type.errors) return "Rest duration must be between 0:00 and 60:00";

  return undefined;
};
