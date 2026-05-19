import { useCallback, useEffect, useState } from "react";

import { Button } from "@bun-mono/core-ui/button";

import type { Cell, Difficulty, Side } from "./engine";
import { readLastUsedSide, useTicTacToeGame, type Score } from "./use-game";

const CELL_KEYS = ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;

const DIFFICULTIES: readonly { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const SIDES: readonly { value: Side; label: string }[] = [
  { value: "X", label: "X" },
  { value: "O", label: "O" },
];

export type TicTacToeAppProps = {
  difficulty: Difficulty;
  onDifficultyChange?: (next: Difficulty) => void;
};

export function TicTacToeApp({ difficulty, onDifficultyChange }: TicTacToeAppProps) {
  const [playerSide, setPlayerSide] = useState<Side>("X");

  useEffect(() => {
    setPlayerSide(readLastUsedSide());
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Tic-tac-toe</h1>
      <DifficultySelector value={difficulty} onChange={onDifficultyChange} />
      <SideSelector value={playerSide} onChange={setPlayerSide} />
      <Game key={`${difficulty}-${playerSide}`} difficulty={difficulty} playerSide={playerSide} />
    </div>
  );
}

type DifficultySelectorProps = {
  value: Difficulty;
  onChange: ((next: Difficulty) => void) | undefined;
};

function DifficultySelector({ value, onChange }: DifficultySelectorProps) {
  return (
    <div aria-label="Difficulty" className="flex gap-1">
      {DIFFICULTIES.map((d) => (
        <DifficultyOption
          key={d.value}
          value={d.value}
          label={d.label}
          selected={d.value === value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

type DifficultyOptionProps = {
  value: Difficulty;
  label: string;
  selected: boolean;
  onChange: ((next: Difficulty) => void) | undefined;
};

function DifficultyOption({ value, label, selected, onChange }: DifficultyOptionProps) {
  const handleClick = useCallback(() => {
    if (!selected) onChange?.(value);
  }, [selected, onChange, value]);
  return (
    <Button
      variant={selected ? "default" : "outline"}
      size="sm"
      aria-pressed={selected}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}

type SideSelectorProps = {
  value: Side;
  onChange: (next: Side) => void;
};

function SideSelector({ value, onChange }: SideSelectorProps) {
  return (
    <div aria-label="Side" className="flex gap-1">
      {SIDES.map((s) => (
        <SideOption
          key={s.value}
          value={s.value}
          label={s.label}
          selected={s.value === value}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

type SideOptionProps = {
  value: Side;
  label: string;
  selected: boolean;
  onChange: (next: Side) => void;
};

function SideOption({ value, label, selected, onChange }: SideOptionProps) {
  const handleClick = useCallback(() => {
    if (!selected) onChange(value);
  }, [selected, onChange, value]);
  return (
    <Button
      variant={selected ? "default" : "outline"}
      size="sm"
      aria-pressed={selected}
      onClick={handleClick}
    >
      {label}
    </Button>
  );
}

function Game({ difficulty, playerSide }: { difficulty: Difficulty; playerSide: Side }) {
  const { board, status, isAiThinking, score, onCellClick, restart } = useTicTacToeGame({
    difficulty,
    playerSide,
  });

  const statusText = renderStatus(status, isAiThinking, playerSide);
  const isGameOver = status.kind === "won" || status.kind === "draw";
  const winningLine = status.kind === "won" ? new Set<number>(status.line) : null;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <ScoreLine score={score} />
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

function ScoreLine({ score }: { score: Score }) {
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
  playerSide: Side,
): string {
  if (status.kind === "won") {
    return status.winner === playerSide ? "You won!" : "AI won";
  }
  if (status.kind === "draw") return "Draw";
  if (isAiThinking) return "AI's turn";
  return "Your turn";
}
