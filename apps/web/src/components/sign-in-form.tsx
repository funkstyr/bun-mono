import { useCallback } from "react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@bun-mono/core-ui/button";
import { Input } from "@bun-mono/core-ui/input";
import { Label } from "@bun-mono/core-ui/label";
import { authClient } from "@/lib/auth-client";

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
  type?: "text" | "password";
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

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const navigate = useNavigate({
    from: "/",
  });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      identifier: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const isEmail = value.identifier.includes("@");
      const callbacks = {
        onSuccess: () => {
          navigate({
            to: "/dashboard",
          });
          toast.success("Sign in successful");
        },
        onError: (error: { error: { message?: string; statusText?: string } }) => {
          toast.error(error.error.message || error.error.statusText);
        },
      };
      if (isEmail) {
        await authClient.signIn.email(
          {
            email: value.identifier,
            password: value.password,
          },
          callbacks,
        );
      } else {
        await authClient.signIn.username(
          {
            username: value.identifier,
            password: value.password,
          },
          callbacks,
        );
      }
    },
    validators: {
      onSubmit: z.object({
        identifier: z.string().min(1, "Email or username is required"),
        password: z.string().min(8, "Password must be at least 8 characters"),
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
      <h1 className="mb-6 text-center text-3xl font-bold">Welcome Back</h1>

      <form onSubmit={handleFormSubmit} className="space-y-4">
        <div>
          <form.Field name="identifier">
            {(field) => <TextField field={field} label="Email or username" />}
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
              {state.isSubmitting ? "Submitting..." : "Sign In"}
            </Button>
          )}
        </form.Subscribe>
      </form>

      <div className="mt-4 text-center">
        <Button
          variant="link"
          onClick={onSwitchToSignUp}
          className="text-indigo-600 hover:text-indigo-800"
        >
          Need an account? Sign Up
        </Button>
      </div>
    </div>
  );
}
