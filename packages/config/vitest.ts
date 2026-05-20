import { fileURLToPath } from "node:url";
import { defineConfig, type ViteUserConfig } from "vitest/config";

type TestConfig = NonNullable<ViteUserConfig["test"]>;

const browserSetupFile = fileURLToPath(new URL("./vitest-setup-browser.ts", import.meta.url));

export function nodePreset(overrides: TestConfig = {}): ViteUserConfig {
  return defineConfig({
    test: {
      environment: "node",
      ...overrides,
    },
  });
}

export function browserPreset(overrides: TestConfig = {}): ViteUserConfig {
  return defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: [browserSetupFile],
      ...overrides,
    },
  });
}
