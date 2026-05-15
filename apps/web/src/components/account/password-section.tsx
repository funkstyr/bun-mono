import { useCallback, useMemo } from "react";
import { ORPCError } from "@orpc/client";
import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@bun-mono/core-ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@bun-mono/core-ui/card";
import { FormControl, FormField, FormLabel, FormMessage } from "@bun-mono/core-ui/form";
import { Input } from "@bun-mono/core-ui/input";
import { client, orpc } from "@/utils/orpc";

type StringField = {
  name: string;
  state: { value: string; meta: { errors: Array<{ message?: string } | string | undefined> } };
  handleBlur: () => void;
  handleChange: (value: string) => void;
};

function PasswordField({
  field,
  label,
  autoComplete,
}: {
  field: StringField;
  label: string;
  autoComplete: "current-password" | "new-password";
}) {
  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => field.handleChange(e.target.value),
    [field],
  );
  return (
    <FormField field={field}>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <Input
          type="password"
          autoComplete={autoComplete}
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={onChange}
        />
      </FormControl>
      <FormMessage />
    </FormField>
  );
}

const currentPasswordValidators = {
  onChange: ({ value }: { value: string }) => (value.length < 1 ? "Required" : undefined),
};

const newPasswordValidators = {
  onChange: ({ value }: { value: string }) =>
    value.length < 8 ? "New password must be at least 8 characters" : undefined,
};

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

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void form.handleSubmit();
    },
    [form],
  );

  const confirmNewPasswordValidators = useMemo(
    () => ({
      onChangeListenTo: ["newPassword"] as Array<"newPassword">,
      onChange: ({
        value,
        fieldApi,
      }: {
        value: string;
        fieldApi: { form: { getFieldValue: (name: "newPassword") => string } };
      }) => {
        if (value.length === 0) return "Required";
        if (value !== fieldApi.form.getFieldValue("newPassword")) {
          return "Passwords do not match";
        }
        return undefined;
      },
    }),
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Change your password. All other devices will be signed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <form.Field name="currentPassword" validators={currentPasswordValidators}>
            {(field) => (
              <PasswordField
                field={field}
                label="Current password"
                autoComplete="current-password"
              />
            )}
          </form.Field>

          <form.Field name="newPassword" validators={newPasswordValidators}>
            {(field) => (
              <PasswordField field={field} label="New password" autoComplete="new-password" />
            )}
          </form.Field>

          <form.Field name="confirmNewPassword" validators={confirmNewPasswordValidators}>
            {(field) => (
              <PasswordField
                field={field}
                label="Confirm new password"
                autoComplete="new-password"
              />
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
