import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";
import { validateUsername } from "@bun-mono/api/lib/validate-username";
import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";
import { FormControl, FormField, FormLabel, FormMessage } from "@bun-mono/core-ui/form";
import { Input } from "@bun-mono/core-ui/input";
import { ORPCError } from "@orpc/client";
import { useForm } from "@tanstack/react-form";
import { useCallback } from "react";
import { toast } from "sonner";

type StringField = {
  name: string;
  state: { value: string; meta: { errors: Array<{ message?: string } | string | undefined> } };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

function ProfileTextField({ field, label }: { field: StringField; label: string }) {
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
    [field],
  );
  return (
    <FormField field={field}>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <Input value={field.state.value} onBlur={field.handleBlur} onChange={onChange} />
      </FormControl>
      <FormMessage />
    </FormField>
  );
}

const nameValidators = {
  onChange: ({ value }: { value: string }) =>
    value.trim().length < 2 ? "Name must be at least 2 characters" : undefined,
};

const usernameValidators = {
  onChange: ({ value }: { value: string }) => {
    const result = validateUsername(value);
    if (!result.ok) return usernameMessages[result.reason];
    return undefined;
  },
};

const usernameMessages: Record<
  Extract<ReturnType<typeof validateUsername>, { ok: false }>["reason"],
  string
> = {
  too_short: "Username must be at least 3 characters",
  too_long: "Username must be at most 30 characters",
  invalid_chars: "Username may only contain letters, numbers, and underscores",
  reserved: "That username is reserved",
};

type ProfileUser = {
  name?: string | null | undefined;
  displayUsername?: string | null | undefined;
  username?: string | null | undefined;
};

export function ProfileSection({ user }: { user: ProfileUser }) {
  const initial = {
    name: user.name ?? "",
    username: user.displayUsername ?? user.username ?? "",
  };

  const form = useForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      try {
        await client.account.updateProfile(value);
        formApi.reset(value);
        toast.success("Profile updated");
        await authClient.getSession({ query: { disableCookieCache: true } });
      } catch (error) {
        if (error instanceof ORPCError) {
          const data = error.data as { field?: string; reason?: string } | undefined;
          if (data?.field === "username") {
            const message =
              data.reason === "taken"
                ? "That username is already taken"
                : data.reason && data.reason in usernameMessages
                  ? usernameMessages[data.reason as keyof typeof usernameMessages]
                  : error.message;
            formApi.setFieldMeta("username", (prev) => ({
              ...prev,
              errors: [{ message }],
              errorMap: { ...prev.errorMap, onSubmit: message },
            }));
            return;
          }
        }
        const message = error instanceof Error ? error.message : "Failed to update profile";
        toast.error(message);
      }
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void form.handleSubmit();
    },
    [form],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your display name and username.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <form.Field name="name" validators={nameValidators}>
            {(field) => <ProfileTextField field={field} label="Name" />}
          </form.Field>

          <form.Field name="username" validators={usernameValidators}>
            {(field) => <ProfileTextField field={field} label="Username" />}
          </form.Field>

          <form.Subscribe>
            {(state) => (
              <Button
                type="submit"
                disabled={!state.isDirty || !state.canSubmit || state.isSubmitting}
              >
                {state.isSubmitting ? "Saving..." : "Save"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
