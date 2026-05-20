import { nodePreset } from "@bun-mono/config/tsdown";

export default nodePreset({
  entry: ["src/server.ts", "src/web.ts", "src/native.ts"],
});
