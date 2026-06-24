import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat ESLint config for the workspace.
 * Type-aware linting is intentionally off here to keep lint fast and project-config-free;
 * tighten per-package where the extra signal is worth it.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // NOTE: `consistent-type-imports` is intentionally NOT enabled. With NestJS's
      // emitDecoratorMetadata-based DI, constructor-parameter types must stay as value
      // imports; forcing `import type` there silently breaks dependency injection.
    },
  },
);
