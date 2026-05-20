import { useCallback } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "@bun-mono/core-ui/button";
import { Input } from "@bun-mono/core-ui/input";

export type NumericStepperProps = {
  id: string;
  value: number;
  onChange: (next: number) => void;
  onBlur: () => void;
  step: number;
  min: number;
  max: number;
  disabled?: boolean;
  ariaInvalid?: boolean;
};

export function NumericStepper({
  id,
  value,
  onChange,
  onBlur,
  step,
  min,
  max,
  disabled,
  ariaInvalid,
}: NumericStepperProps) {
  const decrement = useCallback(() => {
    onChange(Math.max(min, Math.min(max, value - step)));
  }, [onChange, min, max, value, step]);

  const increment = useCallback(() => {
    onChange(Math.max(min, Math.min(max, value + step)));
  }, [onChange, min, max, value, step]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        onChange(Number.NaN);
        return;
      }

      const parsed = Number.parseInt(raw, 10);
      onChange(Number.isNaN(parsed) ? Number.NaN : parsed);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={decrement}
        disabled={disabled || value <= min}
        aria-label={`Decrease by ${step}`}
      >
        <MinusIcon />
      </Button>

      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={handleInputChange}
        onBlur={onBlur}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={ariaInvalid || undefined}
        className="w-16 text-center"
      />

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={increment}
        disabled={disabled || value >= max}
        aria-label={`Increase by ${step}`}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
