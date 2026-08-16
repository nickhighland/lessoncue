import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../server/LessonCue.Server/wwwroot", import.meta.url)),
    emptyOutDir: true,
    // hls.js is intentionally loaded only for HLS playback. Its lazy chunk is
    // larger than Vite's default warning threshold, but it is not part of the
    // initial admin bundle governed by scripts/check-bundle-budget.mjs.
    chunkSizeWarningLimit: 600,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
      "/.well-known": "http://127.0.0.1:8080",
      "/hubs": { target: "http://127.0.0.1:8080", ws: true },
    },
  },
});
