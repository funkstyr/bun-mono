import { useSyncExternalStore } from "react";

import {
  defaultSetConfig,
  emptyStore,
  type SavedSet,
  type SavedWorkout,
  type SetConfig,
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

function copySuffix(baseName: string, existing: readonly SavedSet[]): string {
  const candidate = `${baseName} (copy)`;
  const names = new Set(existing.map((s) => s.name));
  if (!names.has(candidate)) return candidate;
  let n = 2;
  while (names.has(`${baseName} (copy ${n})`)) n++;
  return `${baseName} (copy ${n})`;
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

export function restoreSet(snapshot: SavedSet): SavedSet {
  const { sets, workouts } = read();
  if (!sets.some((s) => s.id === snapshot.id)) {
    sets.push({ ...snapshot, config: { ...snapshot.config } });
    write(sets, workouts);
  }
  return snapshot;
}

export function deleteSet(id: string): SavedSet | null {
  const { sets, workouts } = read();
  const idx = sets.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  const [removed] = sets.splice(idx, 1);
  write(sets, workouts);
  return removed ?? null;
}
