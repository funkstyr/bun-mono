import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "@bun-mono/env/server";

import * as authSchema from "./schema/auth";
import * as roomSchema from "./schema/room";

const client = createClient({
  url: env.DATABASE_URL,
});

export const db = drizzle({ client, schema: { ...authSchema, ...roomSchema } });
