import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "convex/_generated/**",
      "design/**",
      "docs/**",
      "apps/admin/public/**",
      "apps/admin/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/admin/src/**/*.{ts,tsx}", "apps/player/src/**/*.{ts,tsx}", "convex/**/*.ts", "packages/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["convex/**/*.ts", "tests/**/*.ts", "packages/**/*.ts"],
    rules: {
      "no-undef": "off",
    },
  },
];
