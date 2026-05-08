# Fonte de Verdade do Banco de Dados

## Hierarquia de Autoridade

```
1. supabase/migrations/     ← FONTE PRIMÁRIA (o que roda em produção)
2. src/integrations/supabase/types.ts  ← GERADO AUTOMATICAMENTE (reflete o estado real)
3. sql/FULL_MIGRATION.sql    ← SNAPSHOT (concatenação das migrations, usado no CI)
4. sql/03_tables/*.sql       ← REFERÊNCIA LEGADA (não usar para deploys)
```

### Regras

| Artefato | Editável? | Quando usar |
|----------|-----------|-------------|
| `supabase/migrations/` | Apenas via migration tool | Toda alteração de schema |
| `types.ts` | ❌ Nunca (auto-gerado) | Verificar schema atual no código |
| `sql/FULL_MIGRATION.sql` | Regenerar após cada migration | Gate bloqueante no CI |
| `sql/03_tables/*.sql` | ❌ Não modificar | Referência histórica |

---

## Como funciona o drift check

O script `scripts/check-schema-drift.ts` (v3) compara `types.ts` contra `FULL_MIGRATION.sql`
em **quatro dimensões**, todas **bloqueantes** (exit code 1):

| Dimensão | O que compara | Bloqueia CI? |
|----------|--------------|:------------:|
| **Tabelas** | Nomes de tabelas em `types.ts` vs `CREATE TABLE` / `DROP TABLE` no snapshot | ✅ Sim |
| **Colunas** | Colunas do bloco `Row` de cada tabela em `types.ts` vs colunas do `CREATE TABLE` + `ALTER TABLE ADD COLUMN` − `DROP COLUMN` no snapshot | ✅ Sim |
| **Enums** | Enums em `types.ts` vs `CREATE TYPE ... AS ENUM` / `DROP TYPE` no snapshot | ✅ Sim |
| **Functions (RPC)** | Functions expostas em `types.ts` vs `CREATE FUNCTION` / `DROP FUNCTION` no snapshot (excluindo triggers internos) | ✅ Sim |

### Funções internas excluídas da comparação

O script ignora funções que são triggers ou helpers internos e não aparecem como RPC:

- `handle_new_user`, `handle_new_tenant_tokens`
- `update_updated_at_column`, `update_li_updated_at_column`
- `encrypt_bling_tokens`, `encrypt_melhor_envio_tokens`
- `encrypt_email_smtp_password`, `encrypt_ai_credentials`

### Cenários de falha

| Cenário | Causa provável | Correção |
|---------|---------------|----------|
| Tabela/Enum/Function em `types.ts` mas ausente do snapshot | Snapshot desatualizado | Regenerar snapshot |
| Tabela/Enum/Function no snapshot mas ausente de `types.ts` | Recurso foi removido ou snapshot contém definições obsoletas | Regenerar snapshot |
| Coluna em `types.ts` ausente do snapshot | `ALTER TABLE ADD COLUMN` não está no snapshot | Regenerar snapshot |

---

## Como corrigir drift

### Passo 1 — Regenerar `sql/FULL_MIGRATION.sql`

```bash
cat supabase/migrations/*.sql > sql/FULL_MIGRATION.sql
```

### Passo 2 — Validar

```bash
deno run --allow-read scripts/check-schema-drift.ts
```

Exit code 0 = sem drift. Exit code 1 = drift detectado.

### Passo 3 — Commit

O snapshot (`FULL_MIGRATION.sql`) deve ser commitado junto com a migration que causou a mudança.

---

## Responsabilidades

| Ação | Responsável |
|------|-------------|
| Criar migrations | Lovable (via migration tool) |
| Regenerar `types.ts` | Lovable Cloud (automático após migration) |
| Regenerar `FULL_MIGRATION.sql` | Lovable (após cada migration) |
| Validar drift no CI | `scripts/check-schema-drift.ts` (gate bloqueante) |
| Manter este documento atualizado | Atualizar sempre que `check-schema-drift.ts` mudar |

---

## Contagem atual

- **Tabelas em produção (types.ts):** 136
- **Tabelas no snapshot:** 136
- **Migrations acumuladas:** 199
- **Drift de tabelas:** 0 ✅
- **Drift de colunas:** 0 ✅
- **Drift de enums:** 0 ✅
- **Drift de functions:** 0 ✅
