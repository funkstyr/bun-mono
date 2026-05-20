import type { Difficulty, Side } from "./engine";

export const SIDE_STORAGE_KEY = "tic-tac-toe:side";
export const STATS_STORAGE_KEY = "tic-tac-toe:stats";

export type Score = { wins: number; losses: number; draws: number };
export type StatsBlob = Record<Difficulty, Score>;

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

function emptyScore(): Score {
  return { wins: 0, losses: 0, draws: 0 };
}

export function emptyStats(): StatsBlob {
  return { easy: emptyScore(), medium: emptyScore(), hard: emptyScore() };
}

function isFiniteNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isScore(value: unknown): value is Score {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<Score>;
  return (
    isFiniteNonNegativeInt(s.wins) &&
    isFiniteNonNegativeInt(s.losses) &&
    isFiniteNonNegativeInt(s.draws)
  );
}

function parseStats(raw: string | null): StatsBlob {
  if (raw === null) return emptyStats();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyStats();
  }

  if (!parsed || typeof parsed !== "object") return emptyStats();

  const blob = parsed as Partial<Record<Difficulty, unknown>>;
  const result = emptyStats();
  for (const d of DIFFICULTIES) {
    const candidate = blob[d];
    if (isScore(candidate)) result[d] = { ...candidate };
  }
  return result;
}

export function readStats(): StatsBlob {
  if (typeof window === "undefined") return emptyStats();
  return parseStats(window.localStorage.getItem(STATS_STORAGE_KEY));
}

export function writeStats(stats: StatsBlob): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
}

export function readLastUsedSide(): Side {
  if (typeof window === "undefined") return "X";
  const stored = window.localStorage.getItem(SIDE_STORAGE_KEY);
  return stored === "O" ? "O" : "X";
}

export function persistSide(side: Side): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDE_STORAGE_KEY, side);
}
