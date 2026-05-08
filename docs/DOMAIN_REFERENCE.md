# Referência de Domínios e Origens — SpyPro CRM

> Fonte única de verdade sobre domínios, URLs e origens usadas em cada ambiente.

## Ambientes e URLs

| Ambiente | Variável de Env (Secrets) | Exemplo | Uso |
|----------|--------------------------|---------|-----|
| **Produção** | `FRONTEND_URL` | `https://spypro.com.br` | Domínio principal, OAuth redirects, CORS |
| **Produção (www)** | `FRONTEND_URL_ALT` | `https://www.spypro.com.br` | Variação com www, CORS |
| **App / Staging** | `FRONTEND_URL_APP` | `https://crmspypro.lovable.app` | URL Lovable Cloud, OAuth se registrado no Facebook |
| **Preview** | `ALLOW_PREVIEW_ORIGINS=true` | `*.lovable.app` | Subdomínios dinâmicos de preview (opt-in) |
| **Desenvolvimento** | `ALLOW_LOCALHOST=true` | `http://localhost:5173` | Dev local (nunca em produção) |
| **Custom** | `CUSTOM_ORIGIN` | (qualquer) | Domínio adicional se necessário |

## Onde cada URL é configurada

| Local | O que usar | Observação |
|-------|-----------|------------|
| Edge Functions (CORS) | `_shared/frontend-config.ts` → lê env vars | Nunca hardcodar domínios |
| Facebook OAuth (redirect) | Registrar em Facebook App → Valid OAuth URIs | Precisa incluir `FRONTEND_URL` e `FRONTEND_URL_APP` |
| Testes automatizados | Ler de `_shared/test-config.ts` | Testes devem funcionar com qualquer domínio configurado |
| Docs de teste manual | Referir como `$FRONTEND_URL` ou `$FRONTEND_URL_APP` | Não hardcodar URLs reais |

## Mudança de domínio

Se um domínio mudar (ex: migração de `lovable.app` para domínio próprio):

1. Atualize a variável correspondente em **Lovable Cloud → Secrets**
2. Registre o novo domínio no **Facebook App** (OAuth redirect URIs)
3. Testes e CORS se adaptam automaticamente (leem das env vars)
4. Atualize DNS conforme [docs Lovable](https://docs.lovable.dev/features/custom-domain)

> **Nenhum arquivo de código precisa ser editado.** Toda a resolução é via env vars → `frontend-config.ts`.

## Referências

- `supabase/functions/_shared/frontend-config.ts` — lógica de resolução de origens
- `supabase/functions/_shared/cors.ts` — headers CORS usando `frontend-config`
- `docs/ENV_POLICY.md` — política geral de variáveis de ambiente
- `supabase/functions/tests/_shared/test-config.ts` — config centralizada para testes
