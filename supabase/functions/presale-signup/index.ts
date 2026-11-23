import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders } from "../_shared/cors.ts";
import { clientIp, withinRateLimit } from "../_shared/rate-limit.ts";
import { handleGroupLead, handleGroupSizes } from "./group.ts";
import { handleRegister } from "./register.ts";

// Página de pré-venda (/vip/<slug>), endpoint PÚBLICO de propósito.
//   GET  ?slug=outback&kind=group|register -> { title, active, mode } (o link do grupo só sai depois do cadastro)
//   POST { slug, kind?, action?, ..., website }   (kind padrão "group": /vip/<slug>; "register": /cadastro/<slug>)
//     modo "group":    action "lead" (nome/WhatsApp/e-mail -> planilha) e "sizes" (tamanhos opcionais)
//     modo "register": cadastro completo -> contato no Bling
// O campo `website` é isca para robôs (pessoas não veem).

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...publicCorsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

interface PageRow {
  id: string; tenant_id: string; title: string; whatsapp_group_url: string | null;
  is_active: boolean; mode: "group" | "register"; sheet_url: string | null; meta_pixel_id: string | null;
  meta_capi_token_encrypted: string | null; meta_test_event_code: string | null;
}
const SLUG = /^[a-z0-9-]{3,40}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: publicCorsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const kindOf = (v: unknown) => (v === "register" ? "register" : "group");
  const loadPage = async (slug: string, mode: "group" | "register") => {
    if (!SLUG.test(slug)) return null;
    const { data } = await supabase.from("presale_pages")
      .select("id, tenant_id, title, whatsapp_group_url, is_active, mode, sheet_url, meta_pixel_id, meta_capi_token_encrypted, meta_test_event_code")
      .eq("slug", slug).eq("mode", mode).maybeSingle();
    return data as PageRow | null;
  };

  try {
    if (req.method === "GET") {
      const q = new URL(req.url).searchParams;
      const page = await loadPage((q.get("slug") ?? "").toLowerCase(), kindOf(q.get("kind")));
      if (!page) return json({ error: "not_found" }, 404);
      return json({ title: page.title, active: page.is_active, mode: page.mode, metaPixelId: page.meta_pixel_id });
    }
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    // 8 envios por IP a cada 10 min (família na mesma rede passa; robô não). Etapa dos tamanhos conta à parte.
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid", message: "Dados inválidos" }, 400);
    const action = body.action === "sizes" ? "sizes" : "lead";
    if (!(await withinRateLimit(supabase, `presale:${action}:${clientIp(req)}`, action === "sizes" ? 20 : 8, 600))) {
      return json({ error: "rate_limited", message: "Muita tentativa seguida. Espera uns minutos e tenta de novo." }, 429);
    }
    if (typeof body.website === "string" && body.website.trim()) return json({ ok: true, groupUrl: null });

    const page = await loadPage(typeof body.slug === "string" ? body.slug.toLowerCase() : "", kindOf(body.kind));
    if (!page) return json({ error: "not_found", message: "Página não encontrada" }, 404);
    if (!page.is_active) return json({ error: "closed", message: page.mode === "register" ? "Esse link de cadastro não está mais ativo." : "A lista dessa pré-venda já fechou." }, 410);

    let r;
    if (page.mode === "register") r = await handleRegister(supabase, page, body);
    else if (!page.whatsapp_group_url) return json({ error: "server", message: "Página sem grupo configurado." }, 500);
    else {
      const groupPage = { ...page, whatsapp_group_url: page.whatsapp_group_url };
      r = action === "sizes" ? await handleGroupSizes(supabase, groupPage, body) : await handleGroupLead(supabase, groupPage, body, { ip: clientIp(req) === "unknown" ? null : clientIp(req), userAgent: req.headers.get("user-agent") });
    }
    return json(r.body, r.status);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[presale-signup]", err instanceof Error ? err.message : err);
    return json({ error: "server", message: "Deu ruim aqui. Tenta de novo." }, 500);
  }
});
