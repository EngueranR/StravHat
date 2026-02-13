import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  preview: {
    allowedHosts: [
      "stravhatweb-production.up.railway.app",
      ".up.railway.app",
      "localhost",
      "127.0.0.1",
    ],
  },
});
