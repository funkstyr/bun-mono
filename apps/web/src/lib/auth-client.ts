import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { env } from "@bun-mono/env/web";

export const authClient = createAuthClient({
  baseURL: env.VITE_SERVER_URL,
  plugins: [usernameClient()],
});
