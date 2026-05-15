import { type } from "arktype";

export const setConfigSchema = type({
  rounds: "1 <= number.integer <= 99",
  workSec: "1 <= number.integer <= 3600",
  restSec: "0 <= number.integer <= 3600",
  prepSec: "0 <= number.integer <= 60",
});

export type SetConfig = typeof setConfigSchema.infer;

export const savedTimerSchema = type({
  id: "string",
  name: "1 <= string <= 60",
  createdAt: "number",
  updatedAt: "number",
  sets: setConfigSchema.array().exactlyLength(1),
});

export type SavedTimer = typeof savedTimerSchema.infer;

export const storedV1Schema = type({
  schemaVersion: "1",
  timers: savedTimerSchema.array(),
});

export type StoredV1 = typeof storedV1Schema.infer;

export const CURRENT_SCHEMA_VERSION = 1;

export const emptyStore = (): StoredV1 => ({
  schemaVersion: 1,
  timers: [],
});

export const defaultSetConfig = (): SetConfig => ({
  rounds: 5,
  workSec: 30,
  restSec: 10,
  prepSec: 5,
});
