import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { BLING_API_BASE } from "../_shared/bling-sync-helpers.ts";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cid = getCorrelationId(req);
  const log = createLogger("bling-coupon-create", cid);

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { integrationId, codigo, tipo, valor, dataInicio, dataFim, quantidadeUsoMaximo, descricao } = await req.json();

    if (!integrationId) return new Response(JSON.stringify({ success: false, error: "integrationId é obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!codigo || codigo.length < 3 || codigo.length > 20) return new Response(JSON.stringify({ success: false, error: "Código deve ter entre 3 e 20 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!tipo || !["porcentagem", "valor_absoluto"].includes(tipo)) return new Response(JSON.stringify({ success: false, error: 'Tipo deve ser "porcentagem" ou "valor_absoluto"' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!valor || valor <= 0) return new Response(JSON.stringify({ success: false, error: "Valor deve ser maior que zero" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (tipo === "porcentagem" && valor > 100) return new Response(JSON.stringify({ success: false, error: "Porcentagem não pode ser maior que 100%" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const integration = await requireResource<{ id: string; tenant_id: string; metadata: Record<string, unknown> }>(
      supabase, "integrations", integrationId, authTenantId, req, "id, tenant_id, metadata",
    );

    const connectionId = (integration.metadata as Record<string, unknown>)?.bling_connection_id as string | undefined;
    if (!connectionId) return new Response(JSON.stringify({ success: false, error: "Conexão Bling não encontrada. Reconecte a integração." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: conn } = await supabase.from("bling_connections")
      .select("id, tenant_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("id", connectionId).single();
    if (!conn) return new Response(JSON.stringify({ success: false, error: "Conexão Bling não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const accessToken = await ensureBlingToken(supabase, conn, "[bling-coupon-create]");

    const formatDate = (d: string) => new Date(d).toISOString().split("T")[0];

    // Bling v3: tipo 1 = valor fixo, tipo 2 = porcentagem
    const payload = {
      codigo: codigo.toUpperCase(),
      desconto: { tipo: tipo === "porcentagem" ? 2 : 1, valor: valor },
      situacao: { id: 1 },
      dataInicial: dataInicio ? formatDate(dataInicio) : formatDate(new Date().toISOString()),
      dataFinal: dataFim ? formatDate(dataFim) : null,
      limiteUso: quantidadeUsoMaximo || null,
      descricao: descricao || "Cupom criado via sistema",
    };

    log.info(`[bling-coupon-create] POST ${BLING_API_BASE}/cupons-desconto`, JSON.stringify(payload));

    const res = await fetch(`${BLING_API_BASE}/cupons-desconto`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text();
      log.error(`[bling-coupon-create] API error ${res.status}:`, txt);
      let msg = "Erro ao criar cupom no Bling";
      try { const e = JSON.parse(txt); msg = e.error?.message || e.message || msg; } catch { /* noop */ }
      return new Response(JSON.stringify({ success: false, error: msg }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const blingRes = await res.json();
    const blingId = blingRes?.data?.id ?? blingRes?.id ?? null;
    log.info(`[bling-coupon-create] Created, Bling ID: ${blingId}`);

    const { data: saved } = await supabase.from("generated_coupons").insert({
      tenant_id: integration.tenant_id,
      integration_id: integrationId,
      coupon_code: codigo.toUpperCase(),
      discount_percentage: tipo === "porcentagem" ? valor : 0,
      coupon_value: tipo === "valor_absoluto" ? valor : null,
      li_coupon_id: blingId,
      source: "manual",
      coupon_type: tipo,
      coupon_description: descricao || null,
      li_data_inicio: dataInicio ? new Date(dataInicio).toISOString() : new Date().toISOString(),
      li_data_fim: dataFim ? new Date(dataFim).toISOString() : null,
      li_quantidade_uso_maximo: quantidadeUsoMaximo || null,
      li_quantidade_usada: 0,
      expires_at: dataFim ? new Date(dataFim).toISOString() : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    return new Response(JSON.stringify({ success: true, coupon: saved, blingId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("[bling-coupon-create] Error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
