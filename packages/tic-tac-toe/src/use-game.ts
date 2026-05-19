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

export type UseTicTacToeGameOptions = {
  difficulty: Difficulty;
  playerSide?: Side;
};

export type UseTicTacToeGameResult = {
  board: Board;
  status: GameStatus;
  isAiThinking: boolean;
  onCellClick: (index: number) => void;
  restart: () => void;
};

export function useTicTacToeGame({
  difficulty,
  playerSide = "X",
}: UseTicTacToeGameOptions): UseTicTacToeGameResult {
  const [board, setBoard] = useState<Board>(() => emptyBoard());
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

  const onCellClick = useCallback(
    (index: number) => {
      if (isAiTurn) return;
      setBoard((current) => {
        const s = status(current);
        if (s.kind !== "playing" || s.turn !== playerSide) return current;
        return applyMove(current, index, playerSide);
      });
    },
    [isAiTurn, playerSide],
  );

  const restart = useCallback(() => {
    cancelTimer();
    setBoard(emptyBoard());
  }, [cancelTimer]);

  return {
    board,
    status: gameStatus,
    isAiThinking: isAiTurn,
    onCellClick,
    restart,
  };
}
