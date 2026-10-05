import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import {
  extractCartItems, getCampaignDetails, KIND_BY_IDENTIFIER, listAutomations, listCampaigns, normalizeCampaign,
  type FlowKind, type LiCampaign,
} from "../_shared/li-marketing.ts";

type Supabase = ReturnType<typeof createClient>;

export interface CartItem { product_id: number | null; quantity: number; name: string | null; variant?: string | null; price: number | null; image: string | null; url: string | null }

const PAGE = 100;
const MAX_PAGES = 10;          // até 1.000 campanhas por automação por rodada
const MAX_AGE_DAYS = 30;
const DETAILS_PER_RUN = 20;    // o carrinho só existe enquanto a campanha está pendente: busca o detalhe com folga
const DETAILS_REFRESH_MS = 30 * 60_000;

interface ProductRow { id: number; name: string; price: number | null; promo: number | null; image: string | null; url: string | null; parent: number | null }

const parentOf = (raw: Record<string, unknown> | null): number | null => {
  const m = typeof raw?.pai === "string" ? raw.pai.match(/\/produto\/(\d+)/) : null;
  return m ? Number(m[1]) : null;
};

async function loadProducts(supabase: Supabase, integrationId: string, ids: number[]): Promise<Map<number, ProductRow>> {
  const out = new Map<number, ProductRow>();
  const fetchIds = async (list: number[]) => {
    if (!list.length) return;
    const { data } = await supabase.from("li_products")
      .select("loja_integrada_product_id, name, price, promotional_price, image_url, raw_json")
      .eq("integration_id", integrationId).in("loja_integrada_product_id", list);
    for (const p of data ?? []) {
      const raw = (p.raw_json ?? {}) as Record<string, unknown>;
      const img = raw.imagem_principal as Record<string, string> | undefined;
      out.set(Number(p.loja_integrada_product_id), {
        id: Number(p.loja_integrada_product_id), name: String(p.name ?? ""), price: p.price == null ? null : Number(p.price),
        promo: p.promotional_price == null ? null : Number(p.promotional_price),
        image: img?.media || img?.grande || (p.image_url as string | null) || null, // 380 px: leve para e-mail, nítida em tela dupla
        url: typeof raw.url === "string" ? raw.url : null, parent: parentOf(raw),
      });
    }
  };
  await fetchIds([...new Set(ids)]);
  await fetchIds([...new Set([...out.values()].map((p) => p.parent).filter((x): x is number => !!x && !out.has(x)))]);
  return out;
}

/** "Camiseta X - Preto Tamanho:P;Cor:Preto" (variação) → nome do produto pai + "Tamanho: P · Cor: Preto". */
function describe(prod: ProductRow | undefined, all: Map<number, ProductRow>): { name: string | null; variant: string | null; price: number | null; image: string | null; url: string | null } {
  if (!prod) return { name: null, variant: null, price: null, image: null, url: null };
  const parent = prod.parent ? all.get(prod.parent) : undefined;
  const m = prod.name.match(/\s([A-Za-zÀ-ÿ]+:[^;]+(?:;[A-Za-zÀ-ÿ]+:[^;]+)*)$/);
  const variant = parent && m ? m[1].replace(/;/g, " · ").replace(/:/g, ": ") : null;
  const price = prod.promo && prod.promo > 0 && (!prod.price || prod.promo < prod.price) ? prod.promo : (prod.price ?? parent?.price ?? null);
  return { name: parent?.name || (variant ? prod.name.replace(m![0], "").trim() : prod.name) || null, variant, price, image: prod.image || parent?.image || null, url: parent?.url || prod.url };
}

function buildItems(c: ReturnType<typeof normalizeCampaign>, products: Map<number, ProductRow>): CartItem[] {
  return c.product_ids.map((id) => {
    const d = describe(products.get(id), products);
    return { product_id: id, quantity: (c.quantities as Record<string, number>)[id] ?? 1, ...d };
  });
}

export interface CaptureResult { integration: string; seen: number; upserted: number; details: number; gone: number; errors: string[] }

export async function captureIntegration(supabase: Supabase, integration: { id: string; tenant_id: string }, auth: string): Promise<CaptureResult> {
  const result: CaptureResult = { integration: integration.id, seen: 0, upserted: 0, details: 0, gone: 0, errors: [] };
  const automations = await listAutomations(auth);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const startedAt = new Date().toISOString();
  const completeKinds: FlowKind[] = [];

  for (const automation of automations) {
    const kind = KIND_BY_IDENTIFIER[automation.identifier];
    if (!kind) continue;
    const campaigns: LiCampaign[] = [];
    let complete = false;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await listCampaigns(auth, automation.id, PAGE, page * PAGE);
        campaigns.push(...r.campaigns);
        if (r.campaigns.length < PAGE || campaigns.length >= r.total) { complete = true; break; }
      }
    } catch (e) {
      result.errors.push(`${kind}: ${(e as Error).message}`);
      continue;
    }
    if (complete) completeKinds.push(kind);
    const recent = campaigns.filter((c) => { const t = Date.parse(c.eventAt ?? c.createdAt ?? ""); return Number.isFinite(t) && t >= cutoff; });
    result.seen += recent.length;
    if (!recent.length) continue;

    const normalized = recent.map((c) => normalizeCampaign(c, kind));
    const products = await loadProducts(supabase, integration.id, normalized.flatMap((n) => n.product_ids));
    const rows = normalized.map((n) => {
      const { quantities: _q, ...base } = n;
      return { ...base, tenant_id: integration.tenant_id, integration_id: integration.id, items: buildItems(n, products), last_seen_at: startedAt, gone_at: null };
    });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from("li_abandonment_campaigns").upsert(rows.slice(i, i + 200), { onConflict: "integration_id,li_campaign_id" });
      if (error) result.errors.push(`${kind}: ${error.message}`); else result.upserted += Math.min(200, rows.length - i);
    }
  }

  result.details = await fetchPendingDetails(supabase, integration, auth);
  result.gone = await markGone(supabase, integration.id, completeKinds, startedAt);
  return result;
}

/** Pendentes ainda sem carrinho detalhado (ou desatualizado): grava os itens reais do carrinho e completa contato. */
async function fetchPendingDetails(supabase: Supabase, integration: { id: string; tenant_id: string }, auth: string): Promise<number> {
  const stale = new Date(Date.now() - DETAILS_REFRESH_MS).toISOString();
  const { data: pending } = await supabase.from("li_abandonment_campaigns")
    .select("id, li_campaign_id, items, recipient_name, recipient_phone, recipient_email")
    .eq("integration_id", integration.id).eq("flow_status", "open").is("gone_at", null).neq("li_status", "F")
    .or(`details_fetched_at.is.null,details_fetched_at.lt.${stale}`)
    .order("event_at", { ascending: false }).limit(DETAILS_PER_RUN);
  let done = 0;
  for (const row of pending ?? []) {
    try {
      const d = await getCampaignDetails(auth, Number(row.li_campaign_id));
      const cartItems = extractCartItems(d);
      const current = (row.items ?? []) as CartItem[];
      const merged = cartItems.length
        ? cartItems.map((ci) => { const base = current.find((x) => x.product_id === ci.product_id); return { ...base, ...Object.fromEntries(Object.entries(ci).filter(([, v]) => v !== null && v !== "")) }; })
        : current;
      const phone = row.recipient_phone || (d.cellPhone as string | null) || (d.clientMainPhone as string | null) || null;
      const name = row.recipient_name || (d.clientName as string | null) || null;
      await supabase.from("li_abandonment_campaigns").update({
        items: merged, recipient_phone: phone, recipient_name: name,
        cart_json: (d.cart as Record<string, unknown>) ?? null, details_fetched_at: new Date().toISOString(),
      }).eq("id", row.id);
      done++;
    } catch {
      await supabase.from("li_abandonment_campaigns").update({ details_fetched_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  return done;
}

/** Abertos que sumiram da lista da loja (compra feita ou removidos): marca para o fluxo parar. Só quando a listagem veio completa. */
async function markGone(supabase: Supabase, integrationId: string, kinds: FlowKind[], seenSince: string): Promise<number> {
  if (!kinds.length) return 0;
  const { data } = await supabase.from("li_abandonment_campaigns")
    .update({ gone_at: new Date().toISOString() })
    .eq("integration_id", integrationId).in("kind", kinds).eq("flow_status", "open").is("gone_at", null).lt("last_seen_at", seenSince)
    .select("id");
  return data?.length ?? 0;
}
