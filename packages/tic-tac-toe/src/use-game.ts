import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyMove,
  emptyBoard,
  nextAiMove,
  status,
  type Board,
  type Difficulty,
  type GameStatus,
  type Side,
} from "./engine";

const AI_DELAY_MS = 350;

export const SIDE_STORAGE_KEY = "tic-tac-toe:side";
export const STATS_STORAGE_KEY = "tic-tac-toe:stats";

export type Score = { wins: number; losses: number; draws: number };
export type StatsBlob = Record<Difficulty, Score>;

const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

function emptyScore(): Score {
  return { wins: 0, losses: 0, draws: 0 };
}

function emptyStats(): StatsBlob {
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

function writeStats(stats: StatsBlob): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
}

export function readLastUsedSide(): Side {
  if (typeof window === "undefined") return "X";
  const stored = window.localStorage.getItem(SIDE_STORAGE_KEY);
  return stored === "O" ? "O" : "X";
}

function persistSide(side: Side): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIDE_STORAGE_KEY, side);
}

export type UseTicTacToeGameOptions = {
  difficulty: Difficulty;
  playerSide: Side;
};

export type UseTicTacToeGameResult = {
  board: Board;
  status: GameStatus;
  isAiThinking: boolean;
  score: Score;
  onCellClick: (index: number) => void;
  restart: () => void;
};

export function useTicTacToeGame({
  difficulty,
  playerSide,
}: UseTicTacToeGameOptions): UseTicTacToeGameResult {
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [stats, setStats] = useState<StatsBlob>(() => readStats());
  const recordedRef = useRef(false);
  const aiSide: Side = playerSide === "X" ? "O" : "X";
  const gameStatus = status(board);
  const isAiTurn = gameStatus.kind === "playing" && gameStatus.turn === aiSide;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isAiTurn) return;
    cancelTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setBoard((current) => {
        const currentStatus = status(current);
        if (currentStatus.kind !== "playing" || currentStatus.turn !== aiSide) {
          return current;
        }
        const move = nextAiMove(current, aiSide, difficulty);
        return applyMove(current, move, aiSide);
      });
    }, AI_DELAY_MS);
    return cancelTimer;
  }, [board, isAiTurn, aiSide, difficulty, cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  useEffect(() => {
    if (gameStatus.kind === "playing") {
      recordedRef.current = false;
      return;
    }
    if (recordedRef.current) return;
    recordedRef.current = true;
    setStats((prev) => {
      const current = prev[difficulty];
      const nextForDifficulty: Score =
        gameStatus.kind === "draw"
          ? { ...current, draws: current.draws + 1 }
          : gameStatus.winner === playerSide
            ? { ...current, wins: current.wins + 1 }
            : { ...current, losses: current.losses + 1 };
      const next: StatsBlob = { ...prev, [difficulty]: nextForDifficulty };
      writeStats(next);
      return next;
    });
  }, [gameStatus, difficulty, playerSide]);

  const onCellClick = useCallback(
    (index: number) => {
      if (isAiTurn) return;
      if (gameStatus.kind !== "playing" || gameStatus.turn !== playerSide) return;
      if (board[index] !== null) return;
      setBoard((current) => applyMove(current, index, playerSide));
      persistSide(playerSide);
    },
    [board, gameStatus, isAiTurn, playerSide],
  );

  const restart = useCallback(() => {
    cancelTimer();
    recordedRef.current = false;
    setBoard(emptyBoard());
  }, [cancelTimer]);

  return {
    board,
    status: gameStatus,
    isAiThinking: isAiTurn,
    score: stats[difficulty],
    onCellClick,
    restart,
  };
}
