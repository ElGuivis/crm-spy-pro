import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // `any` em todo o código legado vira aviso (~380 ocorrências a reduzir aos poucos)...
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // ...mas é PROIBIDO nos fluxos críticos (auth, credenciais, OAuth e webhooks): use `unknown` + type guard.
  // Regra do projeto (CLAUDE.md). Exceções precisam de `eslint-disable-next-line` com justificativa.
  {
    files: [
      "supabase/functions/*webhook*/**/*.ts",
      "supabase/functions/*oauth*/**/*.ts",
      "supabase/functions/_shared/*webhook*.ts",
      "supabase/functions/_shared/*oauth*.ts",
      "supabase/functions/_shared/*-token.ts",
      "supabase/functions/_shared/auth-guard.ts",
      "supabase/functions/_shared/resource-guard.ts",
      "supabase/functions/_shared/credential-helpers.ts",
      "supabase/functions/_shared/li-auth.ts",
      "supabase/functions/_shared/timing-safe.ts",
      "src/contexts/AuthContext.tsx",
      "src/pages/Auth.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
