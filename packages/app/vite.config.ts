import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Household Finance OS",
        short_name: "Finance OS",
        description: "ADHD-first household finance — statements in, truth out.",
        theme_color: "#4f46e5",
        background_color: "#0b0b12",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: {
    // keeps the app + API on one apparent origin in dev, matching the single-origin
    // production topology (one container behind Caddy) — no CORS code needed anywhere.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
