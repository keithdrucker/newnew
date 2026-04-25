import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
  },
});
