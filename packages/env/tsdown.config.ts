import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/server.ts", "src/web.ts", "src/native.ts"],
  format: "esm",
  target: "es2022",
  platform: "neutral",
  dts: false,
  sourcemap: true,
  splitting: false,
  minify: false,
  clean: false,
});
