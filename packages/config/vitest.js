import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** @typedef {import("vitest/config").ViteUserConfig} ViteUserConfig */
/** @typedef {NonNullable<ViteUserConfig["test"]>} TestConfig */

const browserSetupFile = fileURLToPath(new URL("./vitest-setup-browser.ts", import.meta.url));

/**
 * @param {TestConfig} [overrides]
 * @returns {ViteUserConfig}
 */
export function nodePreset(overrides = {}) {
  return defineConfig({
    test: {
      environment: "node",
      ...overrides,
    },
  });
}

/**
 * @param {TestConfig} [overrides]
 * @returns {ViteUserConfig}
 */
export function browserPreset(overrides = {}) {
  return defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: [browserSetupFile],
      ...overrides,
    },
  });
}
