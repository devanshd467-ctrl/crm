import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    hmr: false,
    fs: {
      deny: [
        ".env",
        ".env.*",
        "**/.git/**",
        "**/.crm-data/**",
        "**/*.sqlite*",
        "**/server/**",
        "**/tests/**",
      ],
    },
  },
  build: { chunkSizeWarningLimit: 800 },
});
