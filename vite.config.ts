import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: "web",
  publicDir: command === "serve" ? "../public" : false,
  build: {
    outDir: "../public",
    emptyOutDir: false
  },
  server: {
    proxy: {
      "/api/": "http://127.0.0.1:3000"
    }
  },
  test: {
    include: ["../src/**/*.test.ts", "**/*.test.ts", "**/*.test.tsx"]
  }
}));
