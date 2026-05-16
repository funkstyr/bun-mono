import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/*.ts", "src/*.tsx", "!src/*.test.ts"],
  format: "esm",
  target: "es2022",
  platform: "browser",
  dts: false,
  sourcemap: true,
  splitting: false,
  minify: false,
  clean: false,
  copy: [{ from: "src/styles.css", to: "dist/styles.css" }],
});
