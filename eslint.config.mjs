import tsparser from "@typescript-eslint/parser";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import microsoftSdl from "@microsoft/eslint-plugin-sdl";
import { defineConfig } from "eslint/config";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: [
      "eslint.config.mjs",
      "main.js",
      "mei-friend-app-copy-just-read-or-copy/**",
      "node_modules/**",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    plugins: {
      "@microsoft/sdl": microsoftSdl,
      "@typescript-eslint": typescriptEslint,
      "no-unsanitized": noUnsanitized,
      obsidianmd,
    },
    rules: {
      "@microsoft/sdl/no-inner-html": "warn",
      "no-unsanitized/property": "warn",
      "obsidianmd/no-plugin-as-component": "off",
      "obsidianmd/no-unsupported-api": "off",
      "obsidianmd/no-view-references-in-plugin": "off",
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/prefer-instanceof": "off",
      "obsidianmd/ui/sentence-case": ["warn", {
        acronyms: ["ABC", "CMME", "GABC", "MEI", "MIDI", "PAE", "SVG", "XML"],
        brands: ["Verovio", "Plaine & Easie"],
        enforceCamelCaseLower: true,
        ignoreRegex: ["^#[0-9A-Fa-f]{6}$"],
      }],
    },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.d.ts"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/unbound-method": "warn",
      "no-prototype-builtins": "off",
      "obsidianmd/no-plugin-as-component": "error",
      "obsidianmd/no-unsupported-api": "error",
      "obsidianmd/no-view-references-in-plugin": "error",
      "obsidianmd/prefer-file-manager-trash-file": "warn",
      "obsidianmd/prefer-instanceof": "error",
      "obsidianmd/sample-names": "off",
    },
  },
]);
