// deno-lint-ignore-file no-explicit-any
/**
 * Busca linhas de `table` cujo `column` está em `ids`, em blocos pequenos e paginando.
 * Antes o cálculo por categoria usava blocos de 500 ids e ignorava o erro: no servidor só voltavam
 * 52 de ~10 mil itens e a tela de categorias ficava quase vazia (34 registros em vez de ~4,6 mil).
 * Aqui qualquer erro derruba a etapa (e fica no log) em vez de gerar um resultado parcial.
 */
export async function fetchByIds<T = Record<string, unknown>>(
  supabase: any,
  table: string,
  select: string,
  column: string,
  ids: unknown[],
  chunkSize = 100,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from(table).select(select).in(column, chunk).range(from, from + pageSize - 1)
      if (error) throw new Error(`${table}.${column}: ${error.message ?? String(error)}`)
      if (!data || data.length === 0) break
      out.push(...(data as T[]))
      if (data.length < pageSize) break
    }
  }
  return out
}

/** Nomes das categorias da Loja Integrada (`id` -> nome); falha silenciosa: sem nome vale `cat_<id>`. */
export async function fetchLiCategoryNames(
  supabase: any,
  integrationId: string,
  log: { warn: (...a: unknown[]) => void },
): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  try {
    const { data } = await supabase.from('integrations').select('api_key').eq('id', integrationId).maybeSingle()
    const token = typeof data?.api_key === 'string' ? data.api_key.trim().replace(/^Basic\s+/i, '') : ''
    if (!token) return names
    for (let offset = 0; offset < 1000; offset += 100) {
      const res = await fetch(`https://api.awsli.com.br/v1/categoria?limit=100&offset=${offset}`, {
        headers: { Authorization: `Basic ${token}` },
      })
      if (!res.ok) { log.warn(`[RFM] categorias da loja: HTTP ${res.status}`); break }
      const body = await res.json()
      for (const c of body?.objects ?? []) if (c?.id && c?.nome) names.set(String(c.id), String(c.nome))
      if (!body?.meta?.next) break
    }
  } catch (e) {
    log.warn('[RFM] categorias da loja indisponíveis:', e)
  }
  return names
}
