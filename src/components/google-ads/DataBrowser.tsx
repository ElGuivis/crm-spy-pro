import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/googleAds";
import { fmtRoas } from "@/lib/googleAdsStrategy";

type Row = Record<string, unknown>;
interface Col { h: string; get: (r: Row) => string; right?: boolean }
interface Dataset { label: string; hint: string; load: (accountId: string) => Promise<Row[]>; cols: Col[] }

const n = (v: unknown) => Number(v ?? 0);
const int = (v: unknown) => n(v).toLocaleString("pt-BR");
const roasOf = (r: Row) => (n(r.cost_micros) > 0 ? fmtRoas(n(r.conversions_value) / (n(r.cost_micros) / 1e6)) : "—");
const metrics: Col[] = [
  { h: "Gasto", get: (r) => brl(n(r.cost_micros)), right: true }, { h: "Cliques", get: (r) => int(r.clicks), right: true },
  { h: "Conversões", get: (r) => n(r.conversions).toLocaleString("pt-BR", { maximumFractionDigits: 1 }), right: true },
  { h: "Receita", get: (r) => brl(n(r.conversions_value) * 1e6), right: true }, { h: "ROAS", get: roasOf, right: true },
];
const ok = <T,>(res: { data: T[] | null; error: { message: string } | null }): Row[] => {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as unknown as Row[];
};

const rpcTerms = (order: "cost" | "revenue" | "waste") => async (id: string) =>
  ok(await supabase.rpc("google_ads_term_top", { p_account: id, p_order: order, p_limit: 50 }));

const DATASETS: Record<string, Dataset> = {
  terms_cost: { label: "Termos de pesquisa — mais gastaram", hint: "Buscas reais que acionaram seus anúncios (histórico completo).", load: rpcTerms("cost"), cols: [{ h: "Termo", get: (r) => String(r.search_term) }, ...metrics] },
  terms_revenue: { label: "Termos de pesquisa — mais venderam", hint: "Ordenado por receita.", load: rpcTerms("revenue"), cols: [{ h: "Termo", get: (r) => String(r.search_term) }, ...metrics] },
  terms_waste: { label: "Termos de pesquisa — gastaram sem converter", hint: "Candidatos a palavra-chave negativa.", load: rpcTerms("waste"), cols: [{ h: "Termo", get: (r) => String(r.search_term) }, ...metrics.slice(0, 2)] },
  keywords: {
    label: "Palavras-chave", hint: "Top 100 por gasto, com nota de qualidade quando o Google informa.",
    load: async (id) => ok(await supabase.from("google_ads_keywords").select("*").eq("account_id", id).eq("negative", false).order("cost_micros", { ascending: false }).limit(100)),
    cols: [{ h: "Palavra", get: (r) => String(r.text) }, { h: "Tipo", get: (r) => String(r.match_type ?? "—") }, { h: "Status", get: (r) => String(r.status) }, { h: "Nota", get: (r) => (r.quality_score == null ? "—" : String(r.quality_score)), right: true }, ...metrics],
  },
  ads: {
    label: "Anúncios", hint: "Títulos dos anúncios de pesquisa, força e aprovação.",
    load: async (id) => ok(await supabase.from("google_ads_ads").select("*").eq("account_id", id).order("cost_micros", { ascending: false }).limit(100)),
    cols: [{ h: "Títulos", get: (r) => ((r.headlines as string[] | null) ?? []).slice(0, 3).join(" | ") || String(r.type ?? "—") }, { h: "Status", get: (r) => String(r.status) }, { h: "Aprovação", get: (r) => String(r.approval_status ?? "—") }, { h: "Força", get: (r) => String(r.ad_strength ?? "—") }, ...metrics.slice(0, 2)],
  },
  products: {
    label: "Produtos (Shopping)", hint: "Top 100 por receita.",
    load: async (id) => ok(await supabase.from("google_ads_products").select("*").eq("account_id", id).order("conversions_value", { ascending: false }).limit(100)),
    cols: [{ h: "Produto", get: (r) => String(r.title ?? r.item_id) }, { h: "Marca", get: (r) => String(r.brand ?? "—") }, ...metrics],
  },
  landing: {
    label: "Páginas de destino", hint: "Top 100 por gasto; velocidade 1 a 10 quando informada.",
    load: async (id) => ok(await supabase.from("google_ads_landing_pages").select("*").eq("account_id", id).order("cost_micros", { ascending: false }).limit(100)),
    cols: [{ h: "Página", get: (r) => String(r.url).replace(/^https?:\/\//, "").slice(0, 70) }, { h: "Velocidade", get: (r) => (r.speed_score == null ? "—" : String(r.speed_score)), right: true }, ...metrics],
  },
  audiences: {
    label: "Públicos (listas)", hint: "Listas de remarketing e públicos do Google Analytics.",
    load: async (id) => ok(await supabase.from("google_ads_user_lists").select("*").eq("account_id", id).order("size_for_search", { ascending: false, nullsFirst: false }).limit(100)),
    cols: [{ h: "Lista", get: (r) => String(r.name) }, { h: "Tipo", get: (r) => String(r.type ?? "—") }, { h: "Status", get: (r) => String(r.membership_status ?? "—") }, { h: "Tamanho (pesquisa)", get: (r) => int(r.size_for_search), right: true }, { h: "Tamanho (display)", get: (r) => int(r.size_for_display), right: true }],
  },
  negatives: {
    label: "Palavras negativas", hint: "O que já está bloqueado (por campanha e listas compartilhadas).",
    load: async (id) => ok(await supabase.from("google_ads_negatives").select("*").eq("account_id", id).limit(200)),
    cols: [{ h: "Termo / lista", get: (r) => String(r.text ?? "—") }, { h: "Origem", get: (r) => (r.source === "shared_set" ? "Lista compartilhada" : "Campanha") }, { h: "Correspondência", get: (r) => String(r.match_type ?? "—") }, { h: "Itens", get: (r) => (r.member_count == null ? "—" : int(r.member_count)), right: true }],
  },
  changes: {
    label: "Mudanças recentes na conta (30 dias)", hint: "Quem mudou o quê no Google Ads, inclusive fora deste sistema.",
    load: async (id) => ok(await supabase.from("google_ads_changes").select("*").eq("account_id", id).order("changed_at", { ascending: false }).limit(60)),
    cols: [{ h: "Quando", get: (r) => new Date(String(r.changed_at)).toLocaleString("pt-BR") }, { h: "O quê", get: (r) => String(r.resource_type ?? "—") }, { h: "Operação", get: (r) => String(r.operation ?? "—") }, { h: "Campos", get: (r) => String(r.changed_fields ?? "—").slice(0, 60) }, { h: "Quem", get: (r) => String(r.user_email ?? r.client_type ?? "—") }],
  },
};

/** Navegador dos dados brutos sincronizados do Google, para conferir o que os agentes enxergam. */
export function DataBrowser({ accountId }: { accountId: string }) {
  const [key, setKey] = useState("terms_cost");
  const ds = DATASETS[key];
  const q = useQuery({ queryKey: ["google-ads", "browse", accountId, key], queryFn: () => ds.load(accountId) });

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <CardTitle className="text-lg">Dados do Google (brutos)</CardTitle>
        <Select value={key} onValueChange={setKey}>
          <SelectTrigger className="w-full max-w-md"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(DATASETS).map(([k, d]) => <SelectItem key={k} value={k}>{d.label}</SelectItem>)}</SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{ds.hint}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {q.isLoading ? <Skeleton className="h-48 w-full" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : q.data?.length ? (
          <Table>
            <TableHeader><TableRow>{ds.cols.map((c) => <TableHead key={c.h} className={c.right ? "text-right" : ""}>{c.h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>
              {q.data.map((r, i) => (
                <TableRow key={String(r.id ?? r.search_term ?? i)}>
                  {ds.cols.map((c) => <TableCell key={c.h} className={`${c.right ? "text-right" : "max-w-[320px] truncate"}`} title={c.right ? undefined : c.get(r)}>{c.get(r)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">Nenhum dado. Use “Buscar todos os dados” na aba Descobertas.</p>}
      </CardContent>
    </Card>
  );
}
