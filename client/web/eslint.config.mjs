import js from "@eslint/js";
import globals from "globals";
import tseslintParser from "@typescript-eslint/parser";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import pluginNext from "@next/eslint-plugin-next";
import jestPlugin from "eslint-plugin-jest";
import { themeTokens } from "./eslint-local-rules/theme-tokens.mjs";

export default [
  {
    ignores: [
      "**/.next/",
      "node_modules/",
      "generated/",
      "public/",
      "prisma/",
      "*.md",
      ".env",
      "*.d.ts",
      "*.config.{ts,mjs}",
      ".idea/",
      ".vscode/",
      "coverage/",
      "notes/",
      "eslint-local-rules/",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslintParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        // Test files live in tsconfig.test.json (jest globals stay out of
        // the app project); the parser needs both to type-check everything.
        project: ["./tsconfig.json", "./tsconfig.test.json"],
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        React: "readonly",
        process: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
      react: reactPlugin,
      "@next/next": pluginNext,
      theme: themeTokens,
    },
    rules: {
      ...js.configs.recommended.rules,
      "theme/no-raw-scale-values": "error",
      ...tseslintPlugin.configs.recommended.rules,
      ...tseslintPlugin.configs["recommended-type-checked"].rules,
      ...reactPlugin.configs.recommended.rules,
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "no-undef": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
        },
      ],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    files: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    plugins: {
      jest: jestPlugin,
    },
    rules: {
      "jest/no-disabled-tests": "warn",
      "jest/valid-expect": "error",
    },
  },
];
