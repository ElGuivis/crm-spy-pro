import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders } from "../_shared/cors.ts";
import { clientIp, withinRateLimit } from "../_shared/rate-limit.ts";
import { validatePresale } from "./validate.ts";
import { upsertLiCustomer } from "./li-customer.ts";

// Página de pré-venda (/vip/<slug>), endpoint PÚBLICO de propósito.
//   GET  ?slug=outback  -> { title, active } (o link do grupo só sai depois do cadastro)
//   POST { slug, name, email, cpf, phone, birthDate, address{...}, acceptsNewsletter, website }
//        -> grava o cadastro, cria/acha o cliente na Loja Integrada e devolve { ok, groupUrl }.
// Se a loja falhar, o cadastro fica com li_status='failed' e a pessoa entra no grupo do mesmo jeito.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...publicCorsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

interface PageRow { id: string; tenant_id: string; integration_id: string; title: string; whatsapp_group_url: string; li_group_id: number | null; is_active: boolean }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: publicCorsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const loadPage = async (slug: string) => {
    const { data } = await supabase.from("presale_pages")
      .select("id, tenant_id, integration_id, title, whatsapp_group_url, li_group_id, is_active")
      .eq("slug", slug).maybeSingle();
    return data as PageRow | null;
  };

  try {
    if (req.method === "GET") {
      const slug = (new URL(req.url).searchParams.get("slug") ?? "").toLowerCase();
      const page = /^[a-z0-9-]{3,40}$/.test(slug) ? await loadPage(slug) : null;
      if (!page) return json({ error: "not_found" }, 404);
      return json({ title: page.title, active: page.is_active });
    }
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const ip = clientIp(req);
    // 8 cadastros por IP a cada 10 min (família na mesma rede passa; robô não)
    if (!(await withinRateLimit(supabase, `presale:${ip}`, 8, 600))) {
      return json({ error: "rate_limited", message: "Muitas tentativas. Espera uns minutos e tenta de novo." }, 429);
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    // campo invisível: humano deixa vazio, robô preenche. Finge sucesso sem gravar nada.
    if (body && typeof body.website === "string" && body.website.trim()) return json({ ok: true, groupUrl: null });

    const v = validatePresale(body);
    if (!v.ok) return json({ error: "invalid", field: v.field, message: v.message }, 400);
    const input = v.data;

    const page = await loadPage(input.slug);
    if (!page) return json({ error: "not_found", message: "Página não encontrada" }, 404);
    if (!page.is_active) return json({ error: "closed", message: "Os cadastros desta pré-venda foram encerrados." }, 410);

    const row = {
      page_id: page.id,
      tenant_id: page.tenant_id,
      name: input.name,
      email: input.email,
      cpf: input.cpf,
      phone: input.phone,
      birth_date: input.birthDate,
      address: input.address,
      accepts_newsletter: input.acceptsNewsletter,
    };
    const { data: prev } = await supabase.from("presale_signups")
      .select("id, li_status, attempts").eq("page_id", page.id).eq("email", input.email).maybeSingle();

    let signupId: string;
    if (prev) {
      signupId = prev.id;
      await supabase.from("presale_signups").update({ ...row, attempts: prev.attempts + 1, updated_at: new Date().toISOString() }).eq("id", prev.id);
      // já está na loja: não chama a API de novo
      if (prev.li_status === "created" || prev.li_status === "existing") return json({ ok: true, groupUrl: page.whatsapp_group_url });
    } else {
      const { data: ins, error } = await supabase.from("presale_signups").insert(row).select("id").single();
      if (error || !ins) {
        console.error("[presale-signup] insert", error?.message);
        return json({ error: "server", message: "Não deu pra salvar agora. Tenta de novo." }, 500);
      }
      signupId = ins.id;
    }

    const { data: integ } = await supabase.from("integrations").select("api_key")
      .eq("id", page.integration_id).eq("status", "connected").maybeSingle();
    const li = integ?.api_key
      ? await upsertLiCustomer(integ.api_key, input, page.li_group_id)
      : { status: "failed" as const, error: "integração da loja desconectada" };

    await supabase.from("presale_signups").update({
      li_status: li.status,
      li_customer_id: li.status === "failed" ? null : li.customerId,
      li_error: li.status === "failed" ? li.error : null,
      updated_at: new Date().toISOString(),
    }).eq("id", signupId);
    if (li.status === "failed") console.error("[presale-signup] loja", page.id, li.error);

    return json({ ok: true, groupUrl: page.whatsapp_group_url });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[presale-signup]", err instanceof Error ? err.message : err);
    return json({ error: "server", message: "Deu ruim aqui. Tenta de novo." }, 500);
  }
});
