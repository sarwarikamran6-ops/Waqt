import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so Capacitor Android and GitHub Pages / custom domains all load assets.
  base: "./",
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, allowedHosts: true },
});
