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
import { persistSide, readStats, writeStats, type Score, type StatsBlob } from "./storage";

const AI_DELAY_MS = 350;

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
