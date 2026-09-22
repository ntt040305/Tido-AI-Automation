import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled output from the type-verification pass. Linting emitted
    // JavaScript reports on the compiler's choices, not anyone's code: every
    // finding here was a `require()` that tsc generated for CommonJS.
    ".verify-build/**",
  ]),
]);

export default eslintConfig;
