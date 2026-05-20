import { type JSX, useCallback } from "react";

import { Button } from "@bun-mono/core-ui/button";

import type { Difficulty } from "./engine";

const DIFFICULTIES: readonly { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export type DifficultySelectorProps = {
  value: Difficulty;
  onChange: ((next: Difficulty) => void) | undefined;
};

export function DifficultySelector({ value, onChange }: DifficultySelectorProps): JSX.Element {
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

function DifficultyOption({
  value,
  label,
  selected,
  onChange,
}: DifficultyOptionProps): JSX.Element {
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
