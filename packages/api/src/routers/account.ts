import { ORPCError } from "@orpc/server";
import { type } from "arktype";

import { auth } from "@bun-mono/auth";

import { protectedProcedure } from "../index";
import { validateUsername } from "../lib/validate-username";

export const updateProfileInput = type({
  name: "string >= 2",
  username: "string",
});

const updateProfile = protectedProcedure
  .input(updateProfileInput)
  .handler(async ({ context, input }) => {
    const result = validateUsername(input.username);
    if (!result.ok) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Invalid username",
        data: { field: "username", reason: result.reason },
      });
    }

    try {
      await auth.api.updateUser({
        body: {
          name: input.name,
          username: input.username,
          displayUsername: input.username,
        },
        headers: context.headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      if (
        lower.includes("username") &&
        (lower.includes("taken") || lower.includes("exist") || lower.includes("already"))
      ) {
        throw new ORPCError("CONFLICT", {
          message: "That username is already taken",
          data: { field: "username", reason: "taken" },
        });
      }
      throw error;
    }

    return { ok: true as const };
  });

export const accountRouter = {
  updateProfile,
};
