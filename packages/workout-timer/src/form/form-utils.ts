export const firstStringError = (errors: ReadonlyArray<unknown>): string | undefined =>
  errors.find((m): m is string => typeof m === "string");
