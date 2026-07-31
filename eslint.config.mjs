import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "node_modules/**",
    "server/LessonCue.Server/wwwroot/**",
    "android-tv/**/build/**",
    "android-tv/.gradle/**",
    "tvos/.build/**",
    "**/bin/**",
    "**/obj/**",
  ]),
  {
    files: ["web-admin/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    rules: {
      // LessonCue intentionally refreshes server-backed state from effects and
      // renders operator-facing clock/status values from the current time.
      // The core hooks/dependency rules remain enabled; these compiler-oriented
      // rules do not fit those existing polling and status-view patterns.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
  },
  {
    files: ["web-admin/vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
]);
