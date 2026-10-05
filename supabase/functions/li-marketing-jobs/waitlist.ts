import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { listWaitlist } from "../_shared/li-marketing.ts";

type Supabase = ReturnType<typeof createClient>;
const PAGE_SIZE = 100;
const MAX_PAGES = 30;
const KEEP_DAYS = 120;

/** Retrato diário da lista de espera ("avise-me"): quantos esperam cada produto e o estoque no dia. A API não devolve quem espera. */
export async function runWaitlist(supabase: Supabase, integ: { id: string; tenant_id: string }, auth: string) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD em Brasília
  const rows: Record<string, unknown>[] = [];
  for (let p = 1; p <= MAX_PAGES; p++) {
    const { results, total } = await listWaitlist(auth, p, PAGE_SIZE);
    for (const r of results) {
      if (!r.produto_id) continue;
      rows.push({
        integration_id: integ.id, tenant_id: integ.tenant_id, snapshot_date: today, product_id: r.produto_id, parent_id: r.produto_pai_id ?? null,
        sku: r.sku ?? null, name: r.produto_nome ?? null, subscribers: Number(r.inscricoes) || 0, stock: r.estoque == null ? null : Number(r.estoque),
      });
    }
    if (results.length < PAGE_SIZE || rows.length >= total) break;
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("li_waitlist_snapshots").upsert(rows.slice(i, i + 200), { onConflict: "integration_id,snapshot_date,product_id" });
    if (error) throw error;
  }
  await supabase.from("li_waitlist_snapshots").delete().eq("integration_id", integ.id).lt("snapshot_date", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10));
  return { products: rows.length, date: today };
}
