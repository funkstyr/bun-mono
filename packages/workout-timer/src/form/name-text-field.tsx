import { useCallback } from "react";

import { Input } from "@bun-mono/core-ui/input";
import { Label } from "@bun-mono/core-ui/label";

import { FieldError } from "./field-error";
import { firstStringError } from "./form-utils";

export type NameFieldShape = {
  name: string;
  state: { value: string; meta: { errors: ReadonlyArray<unknown> } };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

export function NameTextField({ field }: { field: NameFieldShape }) {
  const errorMsg = firstStringError(field.state.meta.errors);
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
    [field],
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.name}>Name</Label>
      <Input
        id={field.name}
        name={field.name}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={onChange}
        aria-invalid={errorMsg ? true : undefined}
      />
      <FieldError message={errorMsg} />
    </div>
  );
}
