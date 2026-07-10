import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{js,ts}", "test/**/*.js"],
    languageOptions: {
      globals: {
        AbortSignal: "readonly",
        Blob: "readonly",
        Buffer: "readonly",
        FormData: "readonly",
        URL: "readonly",
        console: "readonly",
        fetch: "readonly",
        performance: "readonly",
        process: "readonly",
        setTimeout: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["public/**/*.js", "web/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        AbortController: "readonly",
        Blob: "readonly",
        CustomEvent: "readonly",
        File: "readonly",
        FormData: "readonly",
        HTMLInputElement: "readonly",
        URL: "readonly",
        clearTimeout: "readonly",
        document: "readonly",
        fetch: "readonly",
        history: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        window: "readonly"
      }
    }
  }
);
