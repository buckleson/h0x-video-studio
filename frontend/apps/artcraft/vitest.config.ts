import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  root: __dirname,
  // Resolves "~/" and the workspace libs the same way the app build does.
  plugins: [tsconfigPaths({ projects: [path.resolve(__dirname, "..", "..", "tsconfig.base.json")] })],
  test: {
    environment: "jsdom",
    include: ["app/src/**/*.{spec,test}.{ts,tsx}"],
  },
});
