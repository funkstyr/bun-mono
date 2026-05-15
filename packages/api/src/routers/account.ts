import { ORPCError } from "@orpc/server";
import { type } from "arktype";

import { auth } from "@bun-mono/auth";

import { protectedProcedure } from "../index";
import { parseUserAgent } from "../lib/parse-user-agent";
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

const listSessions = protectedProcedure.handler(async ({ context }) => {
  const sessions = await auth.api.listSessions({ headers: context.headers });
  const currentToken = context.session.session.token;

  const rows = sessions.map((s) => {
    const ua = parseUserAgent(s.userAgent ?? null);
    return {
      id: s.id,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
      ipAddress: s.ipAddress ?? null,
      lastActiveAt: s.updatedAt,
      isCurrent: s.token === currentToken,
    };
  });

  rows.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime();
  });

  return rows;
});

export const revokeSessionInput = type({ sessionId: "string" });

const revokeSession = protectedProcedure
  .input(revokeSessionInput)
  .handler(async ({ context, input }) => {
    const sessions = await auth.api.listSessions({ headers: context.headers });
    const target = sessions.find((s) => s.id === input.sessionId);
    if (!target) {
      throw new ORPCError("NOT_FOUND", { message: "Session not found" });
    }
    if (target.token === context.session.session.token) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Cannot revoke the current session",
        data: { reason: "current_session" },
      });
    }

    await auth.api.revokeSession({
      body: { token: target.token },
      headers: context.headers,
    });

    return { ok: true as const };
  });

const revokeOtherSessions = protectedProcedure.handler(async ({ context }) => {
  await auth.api.revokeOtherSessions({ headers: context.headers });
  return { ok: true as const };
});

export const changePasswordInput = type({
  currentPassword: "string >= 1",
  newPassword: "string >= 8",
});

const changePassword = protectedProcedure
  .input(changePasswordInput)
  .handler(async ({ context, input }) => {
    try {
      await auth.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        },
        headers: context.headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("invalid password")) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Current password is incorrect",
          data: { field: "currentPassword", reason: "invalid" },
        });
      }
      throw error;
    }

    return { ok: true as const };
  });

export const deleteAccountInput = type({ confirmation: "string >= 1" });

const deleteAccount = protectedProcedure
  .input(deleteAccountInput)
  .handler(async ({ context, input }) => {
    const sessionUsername = context.session.user.username;
    if (!sessionUsername) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Account has no username to confirm against",
      });
    }
    if (input.confirmation.toLowerCase() !== sessionUsername.toLowerCase()) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Confirmation does not match your username",
        data: { field: "confirmation", reason: "mismatch" },
      });
    }

    await auth.api.deleteUser({
      body: {},
      headers: context.headers,
    });

    return { ok: true as const };
  });

export const accountRouter = {
  updateProfile,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  changePassword,
  deleteAccount,
};
