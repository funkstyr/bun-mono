import { defineConfig, mergeConfig, type UserConfig } from "tsdown";

const base = {
  format: "esm",
  target: "es2022",
  dts: false,
  sourcemap: true,
  splitting: false,
  minify: false,
  clean: false,
} satisfies UserConfig;

export function nodePreset(overrides: UserConfig = {}): UserConfig {
  return defineConfig(
    mergeConfig(
      {
        ...base,
        platform: "neutral",
        entry: ["src/**/*.ts", "!src/**/*.test.ts"],
      },
      overrides,
    ),
  );
}

export function browserPreset(overrides: UserConfig = {}): UserConfig {
  return defineConfig(
    mergeConfig(
      {
        ...base,
        platform: "browser",
        entry: ["src/*.ts", "src/*.tsx", "!src/*.test.ts", "!src/*.test.tsx"],
      },
      overrides,
    ),
  );
}
