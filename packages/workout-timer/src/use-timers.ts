import { useSyncExternalStore } from "react";

import { cascadeDeleteSet, type RemovedSlot } from "./cascade";
import {
  defaultSetConfig,
  emptyStore,
  type SavedSet,
  type SavedWorkout,
  type SetConfig,
  type Slot,
} from "./schemas";
import { loadAndMigrate, saveAll, STORAGE_KEY, subscribe } from "./storage";

const EMPTY_SETS: readonly SavedSet[] = [];
const EMPTY_WORKOUTS: readonly SavedWorkout[] = [];

let cachedRaw: string | null | undefined = undefined;
let cachedSets: readonly SavedSet[] = EMPTY_SETS;
let cachedWorkouts: readonly SavedWorkout[] = EMPTY_WORKOUTS;

function refreshCache(): void {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return;
  cachedRaw = raw;
  const state = loadAndMigrate();
  cachedSets = state.sets;
  cachedWorkouts = state.workouts;
}

function getSetsSnapshot(): readonly SavedSet[] {
  refreshCache();
  return cachedSets;
}

function getWorkoutsSnapshot(): readonly SavedWorkout[] {
  refreshCache();
  return cachedWorkouts;
}

function getServerSetsSnapshot(): readonly SavedSet[] {
  return EMPTY_SETS;
}

function getServerWorkoutsSnapshot(): readonly SavedWorkout[] {
  return EMPTY_WORKOUTS;
}

function subscribeBoth(listener: () => void): () => void {
  const unsubLocal = subscribe(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    unsubLocal();
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useTimers(): readonly SavedSet[] {
  return useSyncExternalStore(subscribeBoth, getSetsSnapshot, getServerSetsSnapshot);
}

export function useWorkouts(): readonly SavedWorkout[] {
  return useSyncExternalStore(subscribeBoth, getWorkoutsSnapshot, getServerWorkoutsSnapshot);
}

function read(): { sets: SavedSet[]; workouts: SavedWorkout[] } {
  const state = loadAndMigrate();
  return { sets: [...state.sets], workouts: [...state.workouts] };
}

function write(sets: SavedSet[], workouts: SavedWorkout[]): void {
  saveAll({ ...emptyStore(), sets, workouts });
}

function dedupeName(name: string, existing: readonly SavedSet[]): string {
  const names = new Set(existing.map((s) => s.name));
  if (!names.has(name)) return name;
  let n = 2;
  while (names.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

export function createSet(input?: { name?: string; config?: SetConfig }): SavedSet {
  const { sets, workouts } = read();
  const now = Date.now();
  const set: SavedSet = {
    id: crypto.randomUUID(),
    name: dedupeName(input?.name ?? "New set", sets),
    createdAt: now,
    updatedAt: now,
    config: input?.config ?? defaultSetConfig(),
  };
  sets.push(set);
  write(sets, workouts);
  return set;
}

export function updateSet(
  id: string,
  patch: Partial<Pick<SavedSet, "name">> & { config?: SetConfig },
): SavedSet | null {
  const { sets, workouts } = read();
  const idx = sets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const prev = sets[idx]!;
  const next: SavedSet = {
    ...prev,
    name: patch.name ?? prev.name,
    config: patch.config ?? prev.config,
    updatedAt: Date.now(),
  };
  sets[idx] = next;
  write(sets, workouts);
  return next;
}

function copySuffix(baseName: string, existing: readonly { name: string }[]): string {
  const candidate = `${baseName} (copy)`;
  const names = new Set(existing.map((s) => s.name));
  if (!names.has(candidate)) return candidate;
  let n = 2;
  while (names.has(`${baseName} (copy ${n})`)) n++;
  return `${baseName} (copy ${n})`;
}

function dedupeWorkoutName(name: string, existing: readonly SavedWorkout[]): string {
  const names = new Set(existing.map((w) => w.name));
  if (!names.has(name)) return name;
  let n = 2;
  while (names.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

export function duplicateSet(id: string): SavedSet | null {
  const { sets, workouts } = read();
  const source = sets.find((s) => s.id === id);
  if (!source) return null;
  const now = Date.now();
  const copy: SavedSet = {
    id: crypto.randomUUID(),
    name: copySuffix(source.name, sets),
    createdAt: now,
    updatedAt: now,
    config: { ...source.config },
  };
  sets.push(copy);
  write(sets, workouts);
  return copy;
}

export type DeleteSetResult = {
  removedSet: SavedSet;
  removedSlots: RemovedSlot[];
};

export function deleteSet(id: string): DeleteSetResult | null {
  const { sets, workouts } = read();
  const idx = sets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const removedSet: SavedSet = { ...sets[idx]!, config: { ...sets[idx]!.config } };
  const nextSets = sets.filter((s) => s.id !== id);
  const { nextWorkouts, removedSlots } = cascadeDeleteSet(workouts, id);
  write(nextSets, nextWorkouts);
  return { removedSet, removedSlots };
}

export function restoreSet(snapshot: SavedSet, removedSlots: readonly RemovedSlot[] = []): void {
  const { sets, workouts } = read();
  if (!sets.some((s) => s.id === snapshot.id)) {
    sets.push({ ...snapshot, config: { ...snapshot.config } });
  }
  if (removedSlots.length > 0) {
    const workoutsById = new Map<string, SavedWorkout>();
    for (const w of workouts) workoutsById.set(w.id, w);
    const touched = new Set<string>();
    for (const removed of removedSlots) {
      const target = workoutsById.get(removed.workoutId);
      if (!target) continue;
      if (!touched.has(target.id)) {
        const cloned: SavedWorkout = { ...target, slots: target.slots.map((s) => ({ ...s })) };
        workoutsById.set(target.id, cloned);
        touched.add(target.id);
      }
      const current = workoutsById.get(removed.workoutId)!;
      const insertAt = Math.min(removed.slotIndex, current.slots.length);
      current.slots.splice(insertAt, 0, { ...removed.slot });
    }
    const nextWorkouts = workouts.map((w) => workoutsById.get(w.id) ?? w);
    write(sets, nextWorkouts);
  } else {
    write(sets, workouts);
  }
}

export type CreateWorkoutInput = {
  name?: string;
  prepSec?: number;
  repeats?: number;
  slots?: Slot[];
};

export function createWorkout(input?: CreateWorkoutInput): SavedWorkout {
  const { sets, workouts } = read();
  const now = Date.now();
  const workout: SavedWorkout = {
    id: crypto.randomUUID(),
    name: dedupeWorkoutName(input?.name ?? "New workout", workouts),
    createdAt: now,
    updatedAt: now,
    prepSec: input?.prepSec ?? 10,
    repeats: input?.repeats ?? 1,
    slots: input?.slots ? input.slots.map((s) => ({ setId: s.setId })) : [],
  };
  workouts.push(workout);
  write(sets, workouts);
  return workout;
}

export function updateWorkout(
  id: string,
  patch: Partial<Pick<SavedWorkout, "name" | "prepSec" | "repeats">> & { slots?: Slot[] },
): SavedWorkout | null {
  const { sets, workouts } = read();
  const idx = workouts.findIndex((w) => w.id === id);
  if (idx === -1) return null;
  const prev = workouts[idx]!;
  const next: SavedWorkout = {
    ...prev,
    name: patch.name ?? prev.name,
    prepSec: patch.prepSec ?? prev.prepSec,
    repeats: patch.repeats ?? prev.repeats,
    slots: patch.slots ? patch.slots.map((s) => ({ setId: s.setId })) : prev.slots,
    updatedAt: Date.now(),
  };
  workouts[idx] = next;
  write(sets, workouts);
  return next;
}

export function duplicateWorkout(id: string): SavedWorkout | null {
  const { sets, workouts } = read();
  const source = workouts.find((w) => w.id === id);
  if (!source) return null;
  const now = Date.now();
  const copy: SavedWorkout = {
    id: crypto.randomUUID(),
    name: copySuffix(source.name, workouts),
    createdAt: now,
    updatedAt: now,
    prepSec: source.prepSec,
    repeats: source.repeats,
    slots: source.slots.map((s) => ({ setId: s.setId })),
  };
  workouts.push(copy);
  write(sets, workouts);
  return copy;
}

export function deleteWorkout(id: string): SavedWorkout | null {
  const { sets, workouts } = read();
  const idx = workouts.findIndex((w) => w.id === id);
  if (idx === -1) return null;
  const [removed] = workouts.splice(idx, 1);
  write(sets, workouts);
  return removed ?? null;
}

export function restoreWorkout(snapshot: SavedWorkout): SavedWorkout {
  const { sets, workouts } = read();
  if (!workouts.some((w) => w.id === snapshot.id)) {
    workouts.push({ ...snapshot, slots: snapshot.slots.map((s) => ({ setId: s.setId })) });
    write(sets, workouts);
  }
  return snapshot;
}
