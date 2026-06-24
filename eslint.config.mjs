// Root ESLint config so root-cwd invocations (e.g. lint-staged in the pre-commit hook)
// resolve a flat config. Each workspace also has its own eslint.config.mjs, which ESLint
// prefers when linting from inside that package.
export { default } from "@payce/config/eslint";
