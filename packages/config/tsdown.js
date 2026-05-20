import { defineConfig, mergeConfig } from "tsdown";

/** @typedef {import("tsdown").UserConfig} UserConfig */

/** @type {UserConfig} */
const base = {
  format: "esm",
  target: "es2022",
  dts: false,
  sourcemap: true,
  splitting: false,
  minify: false,
  clean: false,
};

/**
 * @param {UserConfig} [overrides]
 * @returns {UserConfig}
 */
export function nodePreset(overrides = {}) {
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

/**
 * @param {UserConfig} [overrides]
 * @returns {UserConfig}
 */
export function browserPreset(overrides = {}) {
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
