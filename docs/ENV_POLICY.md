# Política de .env — SpyPro CRM

> **Fonte única de verdade** sobre variáveis de ambiente e segredos do projeto.

## Regra principal

| Arquivo | Versionado? | Conteúdo | Quem gerencia |
|---------|-------------|----------|---------------|
| `.env` | ✅ Sim (auto-gerenciado) | Apenas `VITE_*` (chaves públicas) | Lovable Cloud (automático) |
| `.env.example` | ✅ Sim | Referência para novos devs | Equipe |
| `.env.local` | ❌ Não (coberto por `*.local` no `.gitignore`) | Overrides locais, se necessário | Desenvolvedor local |

## Por que .env pode ficar no repositório

O `.env` do Lovable Cloud contém **exclusivamente chaves públicas/anon** (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`). Essas variáveis são enviadas
ao navegador de qualquer forma via `import.meta.env` — é assim que Vite e Supabase foram
projetados. **Não há vazamento de segredos.**

## Onde ficam os segredos privados

| Tipo | Armazenamento | Acesso |
|------|--------------|--------|
| Segredos de aplicação (API keys, secrets) | Lovable Cloud → Secrets | `Deno.env.get()` em Edge Functions |
| Credenciais de tenant (tokens OAuth, senhas SMTP) | Banco de dados, criptografadas via Vault | `decrypt_secret()` no servidor |

> ⚠️ **NUNCA** adicione segredos privados ao `.env`, ao código-fonte, ou a qualquer arquivo versionado.

## O que fazer em cada cenário

### Novo desenvolvedor entrando no projeto
1. O `.env` já está no repositório com valores válidos — não precisa fazer nada
2. Consulte `.env.example` para entender o que cada variável faz
3. Se precisar de override local, crie `.env.local` (nunca commitado)

### Adicionando uma nova variável pública (VITE_*)
1. O Lovable Cloud atualiza `.env` automaticamente
2. Atualize `.env.example` com a nova variável (descrição + placeholder)

### Adicionando um novo segredo privado
1. Use Lovable Cloud → Secrets para armazenar
2. Acesse via `Deno.env.get('NOME_DO_SEGREDO')` nas Edge Functions
3. Documente na seção de Secrets do `SECURITY_CHECKLIST.md`

### Suspeita de vazamento
1. Siga o checklist de rotação em `SECURITY_CHECKLIST.md`
2. Chaves `VITE_*` no `.env` são públicas por design — não requerem rotação

## Enforcement automático

O script `scripts/check-env-secrets.ts` valida que o `.env` contém **apenas** variáveis
com prefixos permitidos (`VITE_`). O CI executa esse script e **bloqueia o merge** se
qualquer variável não autorizada for encontrada.

Para rodar localmente:

```bash
deno run --allow-read scripts/check-env-secrets.ts
```

## Referências

- `.env.example` — template de referência
- `SECURITY_CHECKLIST.md` — rotação de segredos e arquitetura
- `FUNCTION_CLASSIFICATION.md` — quais funções acessam quais segredos
- `scripts/check-env-secrets.ts` — validação automática do `.env`
