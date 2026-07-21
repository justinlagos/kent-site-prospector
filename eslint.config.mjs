// Minimal, strict-leaning flat config. Type-aware rules run via `pnpm typecheck`.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/*.js", "**/*.mjs"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["error"] }]
    }
  },
  {
    files: ["**/scripts/**", "**/seed*.ts", "apps/worker/**"],
    rules: { "no-console": "off" }
  }
);
