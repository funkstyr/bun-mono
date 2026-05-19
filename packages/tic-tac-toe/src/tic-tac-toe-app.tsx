import { useCallback } from "react";

import { Button } from "@bun-mono/core-ui/button";

import type { Cell, Difficulty } from "./engine";
import { useTicTacToeGame } from "./use-game";

const CELL_KEYS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;

export type TicTacToeAppProps = {
  difficulty?: Difficulty;
};

export function TicTacToeApp({ difficulty = "easy" }: TicTacToeAppProps) {
  const { board, status, isAiThinking, onCellClick, restart } = useTicTacToeGame({
    difficulty,
    playerSide: "X",
  });

  const statusText = renderStatus(status, isAiThinking);
  const isGameOver = status.kind === "won" || status.kind === "draw";
  const winningLine = status.kind === "won" ? new Set<number>(status.line) : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Tic-tac-toe</h1>
      <p aria-live="polite" className="text-muted-foreground min-h-6 text-center text-sm">
        {statusText}
      </p>
      <div className="grid w-full grid-cols-3 gap-2">
        {board.map((cell, index) => (
          <BoardCell
            key={CELL_KEYS[index]}
            index={index}
            value={cell}
            disabled={cell !== null || isAiThinking || isGameOver}
            highlight={winningLine?.has(index) ?? false}
            onClick={onCellClick}
          />
        ))}
      </div>
      {isGameOver ? <Button onClick={restart}>Play again</Button> : null}
    </div>
  );
}

type BoardCellProps = {
  index: number;
  value: Cell;
  disabled: boolean;
  highlight: boolean;
  onClick: (index: number) => void;
};

function BoardCell({ index, value, disabled, highlight, onClick }: BoardCellProps) {
  const handleClick = useCallback(() => onClick(index), [onClick, index]);
  return (
    <button
      type="button"
      aria-label={`Cell ${index + 1}${value ? `, ${value}` : ", empty"}`}
      disabled={disabled}
      onClick={handleClick}
      className={[
        "border-border bg-background aspect-square rounded-md border text-4xl font-bold",
        "flex items-center justify-center transition-colors",
        "disabled:cursor-not-allowed",
        "enabled:hover:bg-accent",
        highlight ? "bg-accent text-accent-foreground" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value ?? ""}
    </button>
  );
}

function renderStatus(
  status: ReturnType<typeof useTicTacToeGame>["status"],
  isAiThinking: boolean,
): string {
  if (status.kind === "won") {
    return status.winner === "X" ? "You won!" : "AI won";
  }
  if (status.kind === "draw") return "Draw";
  if (isAiThinking) return "AI's turn";
  return "Your turn";
}
