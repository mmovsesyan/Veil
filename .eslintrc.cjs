/**
 * Legacy ESLint configuration (for reference).
 * The project uses the modern flat config format in eslint.config.js.
 * This file is kept for compatibility with tools that expect .eslintrc.
 */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/strict",
    "plugin:@typescript-eslint/stylistic",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { prefer: "type-imports" },
    ],
    "@typescript-eslint/no-non-null-assertion": "warn",
  },
  overrides: [
    {
      files: ["packages/ui/**/*.{ts,tsx}"],
      extends: [
        "plugin:react/recommended",
        "plugin:react-hooks/recommended",
      ],
      settings: {
        react: { version: "18" },
      },
      rules: {
        "react/react-in-jsx-scope": "off",
        "react/prop-types": "off",
      },
    },
  ],
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "**/*.config.js", "**/*.config.ts"],
};
