import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite resolves the "@/*" alias from tsconfig.json itself, so no vite-tsconfig-paths plugin
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    // DB tests boot PGlite and run every migration in beforeAll; with many files starting
    // at once that can pass the 10s default on slower machines.
    hookTimeout: 30_000,
  },
});
