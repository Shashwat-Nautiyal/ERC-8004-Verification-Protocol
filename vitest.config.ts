import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals:     true,
    environment: "node",
    include:     ["tests/**/*.test.ts"],
    exclude:     ["tests/integration/**"],   // integration tests opt-in only
    coverage: {
      provider: "v8",
      include:  ["src/**/*.ts"],
      exclude:  ["src/utils/env.ts"],        // boot-time side-effects
    },
  },
});
