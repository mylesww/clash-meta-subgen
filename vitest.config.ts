import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          environment: "jsdom",
          include: ["web/src/**/*.test.{ts,tsx}"],
          setupFiles: ["web/src/test/setup.ts"],
        },
        // The frontend tsconfig enables the automatic JSX runtime.
        root: ".",
      },
    ],
  },
});
