import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: "esm",
  target: "es2022",
  platform: "neutral",
  dts: false,
  sourcemap: true,
  splitting: false,
  minify: false,
  clean: false,
});
