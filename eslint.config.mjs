// Root ESLint config so root-cwd invocations (e.g. lint-staged in the pre-commit hook)
// resolve a flat config. Each workspace also has its own eslint.config.mjs, which ESLint
// prefers when linting from inside that package.
import config from "@payce/config/eslint";

// `load/` holds k6 scripts that run on the k6 (goja) runtime, not Node: they use the `__ENV` global
// and import from `k6/*`, so Node-oriented ESLint rules don't apply. Prettier still formats them.
export default [...config, { ignores: ["load/**"] }];
