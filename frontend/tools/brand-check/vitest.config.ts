import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

// Repo-wide brand, asset and config checks. Node only; no network.
export default defineConfig({
  root: __dirname,
  // Lets a check import small artcraft modules that use the app's "~/" alias.
  resolve: {
    alias: [
      { find: /^~\//, replacement: path.resolve(__dirname, '../../apps/artcraft/app/src') + '/' },
    ],
  },
  test: {
    name: 'brand-check',
    watch: false,
    environment: 'node',
    include: ['**/*.test.ts'],
    // Repo-wide git greps run in parallel and can pass 5 s under load.
    testTimeout: 20000,
    reporters: ['default'],
  },
});
