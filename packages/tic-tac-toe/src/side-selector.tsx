import { type JSX, useCallback } from "react";

import { Button } from "@bun-mono/core-ui/button";

import type { Side } from "./engine";

const SIDES: readonly { value: Side; label: string }[] = [
  { value: "X", label: "X" },
  { value: "O", label: "O" },
];

export type SideSelectorProps = {
  value: Side;
  onChange: (next: Side) => void;
};

export function SideSelector({ value, onChange }: SideSelectorProps): JSX.Element {
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

function SideOption({ value, label, selected, onChange }: SideOptionProps): JSX.Element {
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
