import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy /api calls to the GitHub app backend during development
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
