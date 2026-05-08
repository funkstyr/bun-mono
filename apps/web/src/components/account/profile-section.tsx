import { useForm } from "@tanstack/react-form";
import { ORPCError } from "@orpc/client";
import { toast } from "sonner";

import { validateUsername } from "@bun-mono/api/lib/validate-username";
import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";
import { FormControl, FormField, FormLabel, FormMessage } from "@bun-mono/core-ui/form";
import { Input } from "@bun-mono/core-ui/input";

import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

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
  name?: string | null;
  displayUsername?: string | null;
  username?: string | null;
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your display name and username.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-4"
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) =>
                value.trim().length < 2 ? "Name must be at least 2 characters" : undefined,
            }}
          >
            {(field) => (
              <FormField field={field}>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormField>
            )}
          </form.Field>

          <form.Field
            name="username"
            validators={{
              onChange: ({ value }) => {
                const result = validateUsername(value);
                if (!result.ok) return usernameMessages[result.reason];
                return undefined;
              },
            }}
          >
            {(field) => (
              <FormField field={field}>
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <Input
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </FormControl>
                <FormMessage />
              </FormField>
            )}
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
