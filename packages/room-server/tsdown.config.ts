import { nodePreset } from "@bun-mono/config/tsdown";

export default nodePreset({
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/_test-utils.ts"],
});
