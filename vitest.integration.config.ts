import { defineConfig } from "vitest/config";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env at config time so we can inject vars into the worker via test.env
const parsed = config({ path: resolve(__dirname, ".env") }).parsed ?? {};

export default defineConfig({
  test: {
    globals:    true,
    environment:"node",
    include:    ["tests/integration/**/*.test.ts"],
    // Explicitly forward all .env vars into Vitest worker threads
    env:        parsed,
  },
});
