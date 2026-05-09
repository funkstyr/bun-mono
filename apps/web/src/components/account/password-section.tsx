import { ORPCError } from "@orpc/client";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";
import { FormControl, FormField, FormLabel, FormMessage } from "@bun-mono/core-ui/form";
import { Input } from "@bun-mono/core-ui/input";

import { client, orpc } from "@/utils/orpc";

export function PasswordSection() {
  const queryClient = useQueryClient();

  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
    onSubmit: async ({ value, formApi }) => {
      try {
        await client.account.changePassword({
          currentPassword: value.currentPassword,
          newPassword: value.newPassword,
        });
        formApi.reset();
        await queryClient.invalidateQueries({
          queryKey: orpc.account.listSessions.queryOptions().queryKey,
        });
        toast.success("Password updated. Other devices have been signed out.");
      } catch (error) {
        if (error instanceof ORPCError) {
          const data = error.data as { field?: string; reason?: string } | undefined;
          if (data?.field === "currentPassword") {
            const message = "Current password is incorrect";
            formApi.setFieldMeta("currentPassword", (prev) => ({
              ...prev,
              errors: [{ message }],
              errorMap: { ...prev.errorMap, onSubmit: message },
            }));
            return;
          }
        }
        const message = error instanceof Error ? error.message : "Failed to change password";
        toast.error(message);
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Change your password. All other devices will be signed out.
        </CardDescription>
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
            name="currentPassword"
            validators={{
              onChange: ({ value }) => (value.length < 1 ? "Required" : undefined),
            }}
          >
            {(field) => (
              <FormField field={field}>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
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
            name="newPassword"
            validators={{
              onChange: ({ value }) =>
                value.length < 8 ? "New password must be at least 8 characters" : undefined,
            }}
          >
            {(field) => (
              <FormField field={field}>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
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
            name="confirmNewPassword"
            validators={{
              onChangeListenTo: ["newPassword"],
              onChange: ({ value, fieldApi }) => {
                if (value.length === 0) return "Required";
                if (value !== fieldApi.form.getFieldValue("newPassword")) {
                  return "Passwords do not match";
                }
                return undefined;
              },
            }}
          >
            {(field) => (
              <FormField field={field}>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
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
