export function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;

  return (
    <p className="text-destructive text-xs" role="alert">
      {message}
    </p>
  );
}
