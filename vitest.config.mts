import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Vite resolves the "@/*" alias from tsconfig.json itself, so no vite-tsconfig-paths plugin
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
  },
});
