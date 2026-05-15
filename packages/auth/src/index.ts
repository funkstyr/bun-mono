import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";

import { db } from "@bun-mono/db";
import * as schema from "@bun-mono/db/schema/auth";
import { env } from "@bun-mono/env/server";

import { reservedUsernames } from "./reserved-usernames";

const reservedSet = new Set(reservedUsernames.map((w) => w.toLowerCase()));

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",

    schema: schema,
  }),
  trustedOrigins: [env.CORS_ORIGIN],
  emailAndPassword: {
    enabled: true,
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  plugins: [
    username({
      usernameValidator: (value) => !reservedSet.has(value.toLowerCase()),
    }),
  ],
});
