import * as React from "react";

import { Label } from "./label";
import { cn } from "./utils";

type FieldLike = {
  name: string;
  state: { meta: { errors: Array<{ message?: string } | string | undefined> } };
};

type FormFieldContextValue = {
  id: string;
  name: string;
  errorIds: string;
  hasError: boolean;
  errorMessages: string[];
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function useFormFieldContext() {
  const ctx = React.useContext(FormFieldContext);
  if (!ctx) throw new Error("FormField components must be used inside <FormField>");
  return ctx;
}

function getErrorMessage(error: { message?: string } | string | undefined): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  return error.message;
}

function FormField({ field, children }: { field: FieldLike; children: React.ReactNode }) {
  const id = React.useId();
  const errorMessages = field.state.meta.errors
    .map(getErrorMessage)
    .filter((m): m is string => Boolean(m));
  const hasError = errorMessages.length > 0;
  const errorIds = hasError ? `${id}-error` : "";

  const contextValue = React.useMemo(
    () => ({ id, name: field.name, errorIds, hasError, errorMessages }),
    [id, field.name, errorIds, hasError, errorMessages],
  );

  return (
    <FormFieldContext.Provider value={contextValue}>
      <div className="space-y-2">{children}</div>
    </FormFieldContext.Provider>
  );
}

function FormLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  const { id, hasError } = useFormFieldContext();
  return (
    <Label
      htmlFor={id}
      data-error={hasError || undefined}
      className={cn("data-[error=true]:text-destructive", className)}
      {...props}
    />
  );
}

function FormControl({ children }: { children: React.ReactElement }) {
  const { id, name, errorIds, hasError } = useFormFieldContext();
  return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id,
    name,
    "aria-invalid": hasError || undefined,
    "aria-describedby": errorIds || undefined,
  });
}

function FormMessage({ className, ...props }: React.ComponentProps<"p">) {
  const { errorIds, errorMessages } = useFormFieldContext();
  if (errorMessages.length === 0) return null;
  return (
    <p id={errorIds} className={cn("text-destructive text-xs", className)} role="alert" {...props}>
      {errorMessages[0]}
    </p>
  );
}

export { FormField, FormLabel, FormControl, FormMessage };
