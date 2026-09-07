import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig(({ command }) => ({
  // Build configuration
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "MCPTypescriptTemplate",
      fileName: "index",
      formats: ["es"],
    },
    target: "node24",
    outDir: "dist",
    emptyOutDir: true,
    ssr: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  ssr: {
    external: ["@modelcontextprotocol/server", "@modelcontextprotocol/node", "express", "zod"],
  },
}));
