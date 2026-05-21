import { fileURLToPath } from "node:url";

import { nodePreset } from "@bun-mono/config/vitest";

const globalSetupFile = fileURLToPath(new URL("./src/__tests__/_global-setup.ts", import.meta.url));

// Path passed to the DB layer. Must match what `_global-setup.ts` populates with DDL.
const testDbPath = fileURLToPath(new URL("./.vitest-tmp/test.db", import.meta.url));

export default nodePreset({
  globalSetup: [globalSetupFile],
  // Inject env BEFORE any test module loads — `@bun-mono/env/server` reads
  // `process.env` at module init, and `@bun-mono/db` opens libsql in the same tick.
  env: {
    DATABASE_URL: `file:${testDbPath}`,
    BETTER_AUTH_SECRET: "test-secret-32-chars-long-1234567",
    BETTER_AUTH_URL: "http://localhost:3987",
    CORS_ORIGIN: "http://localhost:3987",
    NODE_ENV: "test",
  },
});
