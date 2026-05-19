import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { resolveNuvemshopConnection, nuvemshopApiBase, nuvemshopFetch } from "../_shared/nuvemshop-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const log = createLogger("nuvemshop-coupon-create", cid);

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { integrationId, codigo, tipo, valor, dataInicio, dataFim, quantidadeUsoMaximo, descricao } = await req.json();

    if (!integrationId) return new Response(JSON.stringify({ success: false, error: "integrationId é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!codigo || codigo.length < 3 || codigo.length > 20) return new Response(JSON.stringify({ success: false, error: "Código deve ter entre 3 e 20 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!tipo || !["porcentagem", "valor_absoluto"].includes(tipo)) return new Response(JSON.stringify({ success: false, error: 'Tipo deve ser "porcentagem" ou "valor_absoluto"' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!valor || valor <= 0) return new Response(JSON.stringify({ success: false, error: "Valor deve ser maior que zero" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (tipo === "porcentagem" && valor > 100) return new Response(JSON.stringify({ success: false, error: "Porcentagem não pode ser maior que 100%" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await requireResource(supabase, "integrations", integrationId, authTenantId, req);

    const conn = await resolveNuvemshopConnection(supabase, integrationId);
    if (!conn) return new Response(JSON.stringify({ success: false, error: "Conexão Nuvemshop não encontrada. Reconecte a integração." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { connection, accessToken } = conn;
    const formatDate = (d: string) => new Date(d).toISOString().split("T")[0];

    // Nuvemshop API: type = "percentage" | "absolute", value is a string decimal
    const payload = {
      code: codigo.toUpperCase(),
      type: tipo === "porcentagem" ? "percentage" : "absolute",
      value: String(valor.toFixed(2)),
      valid: true,
      start_date: dataInicio ? formatDate(dataInicio) : null,
      end_date: dataFim ? formatDate(dataFim) : null,
      max_uses: quantidadeUsoMaximo || null,
    };

    const url = `${nuvemshopApiBase(connection.store_id)}/coupons`;
    log.info(`[nuvemshop-coupon-create] POST ${url}`, JSON.stringify(payload));

    const res = await nuvemshopFetch(url, accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      log.error(`[nuvemshop-coupon-create] API error ${res.status}:`, txt);
      let msg = "Erro ao criar cupom na Nuvemshop";
      try { const e = JSON.parse(txt); msg = e.description || e.message || msg; } catch { /* noop */ }
      return new Response(JSON.stringify({ success: false, error: msg }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nsRes = await res.json();
    const nsId = nsRes?.id ?? null;
    log.info(`[nuvemshop-coupon-create] Created, Nuvemshop ID: ${nsId}`);

    // Get tenant_id from integration
    const { data: intRow } = await supabase.from("integrations").select("tenant_id").eq("id", integrationId).single();

    const { data: saved } = await supabase.from("generated_coupons").insert({
      tenant_id: intRow?.tenant_id,
      integration_id: integrationId,
      coupon_code: codigo.toUpperCase(),
      discount_percentage: tipo === "porcentagem" ? valor : 0,
      coupon_value: tipo === "valor_absoluto" ? valor : null,
      li_coupon_id: nsId,
      source: "manual",
      coupon_type: tipo,
      coupon_description: descricao || null,
      li_data_inicio: dataInicio ? new Date(dataInicio).toISOString() : new Date().toISOString(),
      li_data_fim: dataFim ? new Date(dataFim).toISOString() : null,
      li_quantidade_uso_maximo: quantidadeUsoMaximo || null,
      li_quantidade_usada: 0,
      expires_at: dataFim ? new Date(dataFim).toISOString() : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    return new Response(JSON.stringify({ success: true, coupon: saved, nsId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[nuvemshop-coupon-create] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
