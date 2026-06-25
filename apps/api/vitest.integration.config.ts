import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Integration tests boot the full Nest app, whose DI relies on emitDecoratorMetadata.
// esbuild (Vitest's default) does not emit it, so transform sources with SWC instead.
// Requires a migrated Postgres (DATABASE_URL). Run with `pnpm test:integration`.
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["test/**/*.int.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
