import { type } from "arktype";

export const setConfigSchema = type({
  rounds: "1 <= number.integer <= 99",
  activeSec: "1 <= number.integer <= 3600",
  restSec: "0 <= number.integer <= 3600",
  prepSec: "0 <= number.integer <= 60",
});

export type SetConfig = typeof setConfigSchema.infer;

export const savedSetSchema = type({
  id: "string",
  name: "1 <= string <= 60",
  createdAt: "number",
  updatedAt: "number",
  config: setConfigSchema,
});

export type SavedSet = typeof savedSetSchema.infer;

export const slotSchema = type({
  setId: "string",
});

export type Slot = typeof slotSchema.infer;

export const savedWorkoutSchema = type({
  id: "string",
  name: "1 <= string <= 60",
  createdAt: "number",
  updatedAt: "number",
  prepSec: "0 <= number.integer <= 60",
  repeats: "1 <= number.integer <= 99",
  slots: slotSchema.array().atMostLength(50),
});

export type SavedWorkout = typeof savedWorkoutSchema.infer;

export const storedV2Schema = type({
  schemaVersion: "2",
  sets: savedSetSchema.array(),
  workouts: savedWorkoutSchema.array(),
});

export type StoredV2 = typeof storedV2Schema.infer;

export const savedTimerV1Schema = type({
  id: "string",
  name: "1 <= string <= 60",
  createdAt: "number",
  updatedAt: "number",
  sets: setConfigSchema.array().exactlyLength(1),
});

export type SavedTimerV1 = typeof savedTimerV1Schema.infer;

export const storedV1Schema = type({
  schemaVersion: "1",
  timers: savedTimerV1Schema.array(),
});

export type StoredV1 = typeof storedV1Schema.infer;

export const CURRENT_SCHEMA_VERSION = 2;

export const emptyStore = (): StoredV2 => ({
  schemaVersion: 2,
  sets: [],
  workouts: [],
});

export const defaultSetConfig = (): SetConfig => ({
  rounds: 5,
  activeSec: 30,
  restSec: 10,
  prepSec: 5,
});

export const nameSchema = type("1 <= string <= 60");
export const roundsSchema = type("1 <= number.integer <= 99");
export const prepSecSchema = type("0 <= number.integer <= 60");
export const activeSecSchema = type("1 <= number.integer <= 3600");
export const restSecSchema = type("0 <= number.integer <= 3600");
export const minutesSchema = type("0 <= number.integer <= 60");
export const secondsRemSchema = type("0 <= number.integer <= 59");
export const repeatsSchema = type("1 <= number.integer <= 99");
