/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
    environment: "node",
  },
});
