import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";
import {
  FLOW_KINDS, KIND_BY_IDENTIFIER, LiApiError, TOGGLE_KEY, getAutomationConfig, listAutomations, listRules, setNativeToggles,
  type FlowKind, type LiAutomation,
} from "../_shared/li-marketing.ts";

type Supabase = ReturnType<typeof createClient>;
interface NativeState { kind: FlowKind; on: boolean; automationId: number | null; title: string | null; delays: number[] }

/** Estado real das 3 automações nativas lido da loja: "ligada" = aparece na lista de automações ativas. */
async function readNative(auth: string): Promise<{ state: NativeState[]; automations: LiAutomation[] }> {
  const automations = await listAutomations(auth);
  const state: NativeState[] = [];
  for (const kind of FLOW_KINDS) {
    const a = automations.find((x) => KIND_BY_IDENTIFIER[x.identifier] === kind);
    const rules = a ? await listRules(auth, a.id).catch(() => []) : [];
    state.push({ kind, on: !!a, automationId: a?.id ?? null, title: a?.title ?? null, delays: rules.filter((r) => r.active).map((r) => r.triggerDelay).sort((x, y) => x - y) });
  }
  return { state, automations };
}

/**
 * Tela de Recuperação ↔ automações nativas da Loja Integrada.
 *  { action: "status" }                                   → estado das automações nativas, webhooks e histórico de alterações
 *  { action: "toggle", kind, enabled, acknowledge? }      → liga/desliga UMA automação nativa (com verificação e reversão automática)
 */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("li-marketing", getCorrelationId(req));

  try {
    const { tenantId, userId } = await requireUserAuth(req);
    const supabase: Supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({})) as { action?: string; kind?: string; enabled?: boolean; acknowledge?: boolean };

    const { data: integ } = await supabase.from("integrations").select("id, api_key, metadata").eq("tenant_id", tenantId).eq("type", "loja_integrada").eq("status", "connected").limit(1).maybeSingle();
    if (!integ?.api_key) return json({ success: false, error: "Conecte a Loja Integrada em Integrações." }, 400);
    const auth = liAuthHeader(integ.api_key);
    const meta = (integ.metadata ?? {}) as Record<string, unknown>;

    if (body.action === "status" || !body.action) {
      const [{ state }, config] = await Promise.all([readNative(auth), getAutomationConfig(auth).catch(() => null)]);
      let custom: Record<string, unknown> = {};
      try { custom = config?.custom ? JSON.parse(config.custom) : {}; } catch { /* configuração livre da loja */ }
      const { data: history } = await supabase.from("li_native_toggle_log").select("toggle_key, from_state, to_state, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(8);
      return json({
        success: true, native: state, storeId: config?.storeId ?? null,
        subjectLlm: custom.SubjectLLM === true, nativeWhatsApp: typeof custom.cartWhatsAppText === "string" && custom.cartWhatsAppText.length > 0,
        window: config ? { start: config.startInterval, end: config.endInterval } : null,
        webhooks: { registered: !!meta.webhooks_registered_at, error: (meta.webhooks_error as string | undefined) ?? null },
        storeUrl: (meta.store_url as string | undefined) ?? null, history: history ?? [],
      });
    }

    if (body.action === "toggle") {
      const kind = body.kind as FlowKind;
      if (!FLOW_KINDS.includes(kind) || typeof body.enabled !== "boolean") return json({ success: false, error: "Informe kind (cart|browse|order) e enabled." }, 400);

      if (!body.enabled && !body.acknowledge) {
        // desligar a nativa sem o nosso fluxo cobrindo = ninguém é lembrado: pede confirmação explícita
        const { data: flow } = await supabase.from("abandonment_flows").select("enabled, steps").eq("tenant_id", tenantId).eq("kind", kind).maybeSingle();
        const covered = !!flow?.enabled && Array.isArray(flow.steps) && flow.steps.length > 0;
        if (!covered) return json({ success: false, needsAck: true, error: "O seu fluxo para este tipo está desligado ou sem etapas: desligando a nativa, ninguém será lembrado." }, 409);
      }

      const before = (await readNative(auth)).state;
      const current = before.find((s) => s.kind === kind)!;
      if (current.on === body.enabled) return json({ success: true, unchanged: true, native: before });

      await setNativeToggles(auth, { [TOGGLE_KEY[kind]]: body.enabled });
      let after = (await readNative(auth)).state;
      // a loja pode levar um instante para refletir a mudança: relê algumas vezes antes de concluir que não pegou
      for (let i = 0; i < 3 && after.find((s) => s.kind === kind)!.on !== body.enabled; i++) {
        await new Promise((r) => setTimeout(r, 900));
        after = (await readNative(auth)).state;
      }

      // a loja tem de ter mudado exatamente a automação pedida; qualquer outra coisa é revertida (o mapeamento chave→automação é nosso palpite)
      const changedOthers = after.filter((s) => s.kind !== kind && s.on !== before.find((b) => b.kind === s.kind)!.on);
      const target = after.find((s) => s.kind === kind)!;
      if (target.on !== body.enabled || changedOthers.length) {
        const revert: Record<string, boolean> = { [TOGGLE_KEY[kind]]: current.on };
        for (const o of changedOthers) revert[TOGGLE_KEY[o.kind]] = before.find((b) => b.kind === o.kind)!.on;
        await setNativeToggles(auth, revert).catch((e) => log.error(`[LI-MARKETING] reversão falhou: ${(e as Error).message}`));
        log.error(`[LI-MARKETING] toggle ${kind} não teve o efeito esperado; revertido`);
        return json({ success: false, error: "A loja não aplicou a mudança como esperado e o estado anterior foi restaurado. Confira no painel da Loja Integrada." }, 502);
      }

      await supabase.from("li_native_toggle_log").insert({ tenant_id: tenantId, user_id: userId, toggle_key: TOGGLE_KEY[kind], from_state: current.on, to_state: body.enabled, snapshot: { before } });
      log.info(`[LI-MARKETING] ${TOGGLE_KEY[kind]}: ${current.on} → ${body.enabled}`);
      return json({ success: true, native: after });
    }

    return json({ success: false, error: "Ação desconhecida" }, 400);
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    if (error instanceof LiApiError) return json({ success: false, error: error.message }, 502);
    log.error("[LI-MARKETING]", error);
    return json({ success: false, error: (error as Error)?.message ?? "erro" }, 500);
  }
});
