import { authClient } from "@/lib/auth-client";
import { validateUsername } from "@bun-mono/api/lib/validate-username";
import { Button } from "@bun-mono/core-ui/button";
import { Input } from "@bun-mono/core-ui/input";
import { Label } from "@bun-mono/core-ui/label";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import { z } from "zod";

import Loader from "./loader";

type StringField = {
  name: string;
  state: { value: string; meta: { errors: Array<{ message?: string } | undefined> } };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

function TextField({
  field,
  label,
  type,
}: {
  field: StringField;
  label: string;
  type?: "text" | "password" | "email";
}) {
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
    [field],
  );
  return (
    <div className="space-y-2">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={onChange}
      />
      {field.state.meta.errors.map((error) => (
        <p key={error?.message} className="text-red-500">
          {error?.message}
        </p>
      ))}
    </div>
  );
}

const usernameMessages: Record<
  Extract<ReturnType<typeof validateUsername>, { ok: false }>["reason"],
  string
> = {
  too_short: "Username must be at least 3 characters",
  too_long: "Username must be at most 30 characters",
  invalid_chars: "Username may only contain letters, numbers, and underscores",
  reserved: "That username is reserved",
};

export default function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
      name: "",
      username: "",
    },
    onSubmit: async ({ value, formApi }) => {
      await authClient.signUp.email(
        {
          email: value.email,
          password: value.password,
          name: value.name,
          username: value.username,
          displayUsername: value.username,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/dashboard",
            });
            toast.success("Sign up successful");
          },
          onError: (error) => {
            const message = error.error.message || error.error.statusText;
            const lower = message.toLowerCase();
            if (
              lower.includes("username") &&
              (lower.includes("taken") || lower.includes("exist"))
            ) {
              formApi.setFieldMeta("username", (prev) => ({
                ...prev,
                errors: [{ message: "That username is already taken" }],
                errorMap: { ...prev.errorMap, onSubmit: "That username is already taken" },
              }));
            }
            toast.error(message);
          },
        },
      );
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
        username: z.string().superRefine((value, ctx) => {
          const result = validateUsername(value);
          if (!result.ok) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: usernameMessages[result.reason],
            });
          }
        }),
      }),
    },
  });

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void form.handleSubmit();
    },
    [form],
  );

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-md p-6">
      <h1 className="mb-6 text-center text-3xl font-bold">Create Account</h1>

      <form onSubmit={handleFormSubmit} className="space-y-4">
        <div>
          <form.Field name="name">{(field) => <TextField field={field} label="Name" />}</form.Field>
        </div>

        <div>
          <form.Field name="username">
            {(field) => <TextField field={field} label="Username" />}
          </form.Field>
        </div>

        <div>
          <form.Field name="email">
            {(field) => <TextField field={field} label="Email" type="email" />}
          </form.Field>
        </div>

        <div>
          <form.Field name="password">
            {(field) => <TextField field={field} label="Password" type="password" />}
          </form.Field>
        </div>

        <form.Subscribe>
          {(state) => (
            <Button
              type="submit"
              className="w-full"
              disabled={!state.canSubmit || state.isSubmitting}
            >
              {state.isSubmitting ? "Submitting..." : "Sign Up"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignIn}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Already have an account? Sign In
        </Button>
      </div>
    </div>
  );
}
