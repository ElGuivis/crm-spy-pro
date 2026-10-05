import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { UNLIMITED_USES, type LiCouponKind } from "../_shared/li-coupons.ts";
import { issueCoupon } from "../_shared/coupon-issuer.ts";

const KINDS: LiCouponKind[] = ["porcentagem", "fixo", "frete_gratis"];

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const log = createLogger("li-coupon-create", getCorrelationId(req));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json();

    const codigo = String(b.codigo ?? "").trim().toUpperCase();
    const tipo = b.tipo === "valor_absoluto" ? "fixo" : b.tipo; // nome antigo do tipo
    const valor = Number(b.valor);
    if (!b.integrationId) return json({ success: false, error: "integrationId é obrigatório" }, 400);
    if (!/^[A-Z0-9_-]{3,20}$/.test(codigo)) return json({ success: false, error: "O código deve ter de 3 a 20 letras, números, - ou _ (sem espaços ou acentos)" }, 400);
    if (!KINDS.includes(tipo)) return json({ success: false, error: "Tipo deve ser porcentagem, valor fixo ou frete grátis" }, 400);
    if (tipo !== "frete_gratis" && !(valor > 0)) return json({ success: false, error: "Valor deve ser maior que zero" }, 400);
    if (tipo === "porcentagem" && valor > 100) return json({ success: false, error: "Porcentagem não pode ser maior que 100%" }, 400);

    await requireResource(supabase, "integrations", b.integrationId, authTenantId, req);
    const { data: integration } = await supabase.from("integrations").select("id, api_key, tenant_id").eq("id", b.integrationId).eq("tenant_id", authTenantId).single();
    if (!integration) return json({ success: false, error: "Integração não encontrada" }, 404);

    const validade = b.dataFim ? new Date(b.dataFim).toISOString().slice(0, 10) : null;
    const max = b.quantidadeUsoMaximo ? Number(b.quantidadeUsoMaximo) : UNLIMITED_USES;
    const perCustomer = b.quantidadePorCliente ? Number(b.quantidadePorCliente) : 1;
    const minimo = b.valorMinimo ? Number(b.valorMinimo) : null;
    const grupos = Array.isArray(b.grupoIds) ? b.grupoIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];

    log.info(`[COUPON-CREATE] ${codigo} (${tipo})`);
    const created = await issueCoupon(supabase, {
      tenantId: integration.tenant_id, integrationId: b.integrationId, auth: liAuthHeader(integration.api_key), origin: { type: "manual" },
      spec: { codigo, tipo, valor: tipo === "frete_gratis" ? 0 : valor, validade, quantidade: max, quantidadePorCliente: perCustomer, valorMinimo: minimo, cumulativo: !!b.cumulativo, descricao: b.descricao || undefined, grupos },
    });
    if (!created.ok) {
      log.error(`[COUPON-CREATE] recusado: ${created.status} ${created.error}`);
      return json({ success: false, error: created.error }, created.status >= 400 && created.status < 600 ? created.status : 400);
    }
    const { data: saved } = await supabase.from("generated_coupons").select("*").eq("id", created.ledgerId).single();

    return json({ success: true, coupon: saved, liCouponId: created.liId });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    log.error("[COUPON-CREATE]", message);
    return json({ success: false, error: message }, 500);
  }
});
