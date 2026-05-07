import { env } from "@bun-mono/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema/index";

const client = createClient({
  url: env.DATABASE_URL,
});

export const db = drizzle({ client, schema });
