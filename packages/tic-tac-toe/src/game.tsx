import { type JSX, useCallback } from "react";

import { Button } from "@bun-mono/core-ui/button";
import { Confetti } from "@bun-mono/core-ui/confetti";

import type { Cell, Difficulty, GameStatus, Side } from "./engine";
import type { Score } from "./storage";
import { useTicTacToeGame } from "./use-game";

const CELL_KEYS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;

export type GameProps = {
  difficulty: Difficulty;
  playerSide: Side;
};

export function Game({ difficulty, playerSide }: GameProps): JSX.Element {
  const { board, status, isAiThinking, score, onCellClick, restart } = useTicTacToeGame({
    difficulty,
    playerSide,
  });

  const isGameOver = status.kind === "won" || status.kind === "draw";
  const winningLine = status.kind === "won" ? new Set<number>(status.line) : null;
  const playerWon = status.kind === "won" && status.winner === playerSide;
  const highlightTone: "win" | "loss" | null = !winningLine ? null : playerWon ? "win" : "loss";

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <ScoreLine score={score} />

      {isGameOver ? (
        <EndGameBanner status={status} playerSide={playerSide} />
      ) : (
        <p aria-live="polite" className="text-muted-foreground min-h-6 text-center text-sm">
          {isAiThinking ? "AI's turn" : "Your turn"}
        </p>
      )}

      <div className="grid w-full grid-cols-3 gap-2">
        {board.map((cell, index) => (
          <BoardCell
            key={CELL_KEYS[index]}
            index={index}
            value={cell}
            disabled={cell !== null || isAiThinking || isGameOver}
            highlight={winningLine?.has(index) ? highlightTone : null}
            onClick={onCellClick}
          />
        ))}
      </div>

      {isGameOver ? <Button onClick={restart}>Play again</Button> : null}

      {playerWon ? (
        <div className="pointer-events-none fixed inset-0 z-50">
          <Confetti />
        </div>
      ) : null}
    </div>
  );
}

type EndGameBannerProps = {
  status: Extract<GameStatus, { kind: "won" } | { kind: "draw" }>;
  playerSide: Side;
};

function EndGameBanner({ status, playerSide }: EndGameBannerProps): JSX.Element {
  if (status.kind === "draw") {
    return (
      <output
        aria-live="polite"
        className="border-border flex flex-col items-center gap-1 rounded-md border-2 border-dashed px-6 py-3"
      >
        <span className="text-lg font-semibold">Draw</span>
        <span className="text-muted-foreground text-xs">No three in a row</span>
      </output>
    );
  }

  if (status.winner === playerSide) {
    return (
      <output
        aria-live="polite"
        className="bg-primary text-primary-foreground flex flex-col items-center gap-1 rounded-md px-6 py-3"
      >
        <span className="text-lg font-semibold">You won!</span>
      </output>
    );
  }

  return (
    <output
      aria-live="polite"
      className="border-border text-muted-foreground flex flex-col items-center gap-1 rounded-md border px-6 py-3"
    >
      <span className="text-base font-medium">AI wins</span>
    </output>
  );
}

function ScoreLine({ score }: { score: Score }): JSX.Element {
  return (
    <p aria-label="Score" className="text-muted-foreground text-xs tabular-nums">
      <span>W {score.wins}</span>
      <span className="mx-2">·</span>
      <span>L {score.losses}</span>
      <span className="mx-2">·</span>
      <span>D {score.draws}</span>
    </p>
  );
}

type BoardCellProps = {
  index: number;
  value: Cell;
  disabled: boolean;
  highlight: "win" | "loss" | null;
  onClick: (index: number) => void;
};

function BoardCell({ index, value, disabled, highlight, onClick }: BoardCellProps): JSX.Element {
  const handleClick = useCallback(() => onClick(index), [onClick, index]);

  const highlightClass =
    highlight === "win"
      ? "bg-primary text-primary-foreground border-primary"
      : highlight === "loss"
        ? "bg-muted text-muted-foreground border-muted"
        : "";

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
        highlightClass,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value ?? ""}
    </button>
  );
}
