import js from "@eslint/js";
import globals from "globals";
import tseslintParser from "@typescript-eslint/parser";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import jestPlugin from "eslint-plugin-jest";

// The web package's eslint.config.mjs minus its React/Next/theme layers:
// shared is framework-free TS, so only the base and type-checked rule sets
// apply. Rule tweaks mirror web's so the two packages agree on style.
export default [
  {
    ignores: [
      "node_modules/",
      "coverage/",
      "*.config.{ts,mjs}",
      "*.tsbuildinfo",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslintParser,
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json"],
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslintPlugin.configs.recommended.rules,
      ...tseslintPlugin.configs["recommended-type-checked"].rules,
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      // The contracts use the `const X = {...} as const; type X = ...` enum
      // idiom; core no-redeclare cannot see TS declaration merging.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": "error",
      // Contract rows mirror DB tables; an empty extends is a deliberate
      // named alias there.
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
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
  },
  {
    // The const-plus-same-named-type enum idiom is the contract's public API
    // (it matches what Prisma generates), and no-redeclare's
    // ignoreDeclarationMerge does not admit a value/type pair. tsc already
    // rejects real redeclarations, so nothing is lost by switching it off here.
    files: ["src/contracts/enums.ts"],
    rules: {
      "@typescript-eslint/no-redeclare": "off",
    },
  },
  {
    files: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
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
      "@typescript-eslint/unbound-method": "off",
      "jest/unbound-method": "error",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
