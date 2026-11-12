import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { createLogger, getCorrelationId } from "../_shared/correlation.ts";
import { normEmail, normPhone } from "../_shared/contact-policy.ts";
import { renderTemplate } from "../_shared/order-notification-render.ts";
import { sendWhatsAppMessage, type WhatsAppConfig } from "../_shared/whatsapp-sender.ts";
import { sendEmail, getEmailConfig } from "../_shared/email-sender.ts";

/**
 * order-notification-test — usuário autenticado. Manda UMA mensagem de teste (WhatsApp ou e-mail) com dados de exemplo para o número/e-mail
 * informado, usando o texto que está na tela (mesmo sem salvar). Custa 1 token, como qualquer mensagem automática. Não mexe em pedidos.
 */
const SAMPLE = {
  firstName: "Cliente", name: "Cliente Teste", orderNumber: "9999", status: "Pedido Enviado", total: "R$ 199,90",
  products: "• 1x Camiseta Exemplo - R$ 129,90\n• 1x Boné Exemplo - R$ 70,00", tracking: "BR123456789BR",
};
const MAX_TEXT = 4000;

/** Exemplo da reativação: mesmos marcadores do reactivation-processor. */
function renderReactivation(tpl: string): string {
  const venc = new Date(Date.now() + 7 * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10).split('-').reverse().join('/');
  return tpl
    .replace(/\{\{cliente_nome\}\}/g, 'Cliente Teste').replace(/\{\{cliente_primeiro_nome\}\}/g, 'Cliente')
    .replace(/\{\{desconto\}\}/g, '10').replace(/\{\{cupom\}\}/g, 'TESTE10').replace(/\{\{validade\}\}/g, venc)
    .replace(/\{\{dias_inativo\}\}/g, '65').replace(/\{\{ciclo\}\}/g, '1');
}

serve(async (req) => {
  const log = createLogger("order-notification-test", getCorrelationId(req));
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUserAuth(req);
    if (!auth.tenantId) return json({ error: "Usuário sem loja" }, 403);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const channel = body.channel === "email" ? "email" : "whatsapp";
    const template = typeof body.message_template === "string" ? body.message_template.slice(0, MAX_TEXT) : "";
    if (!template.trim()) return json({ error: "Escreva a mensagem antes de testar" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", { _user_id: auth.userId, _tenant_id: auth.tenantId });
    if (!isAdmin) return json({ error: "Somente administradores" }, 403);

    const { data: hasTokens } = await supabase.rpc("has_enough_tokens", { _tenant_id: auth.tenantId, _amount: 1 });
    if (!hasTokens) return json({ error: "Tokens insuficientes para enviar o teste" }, 402);

    let result: { success: boolean; error?: string };
    let sentTo: string;
    if (channel === "whatsapp") {
      const phone = normPhone(typeof body.to === "string" ? body.to : "");
      if (!phone) return json({ error: "Telefone inválido: use DDD + número" }, 400);
      const integrationId = typeof body.whatsapp_integration_id === "string" ? body.whatsapp_integration_id : "";
      const { data: integ } = await supabase.from("integrations").select("metadata").eq("id", integrationId).eq("tenant_id", auth.tenantId).eq("status", "connected").maybeSingle();
      const instance = ((integ?.metadata ?? {}) as Record<string, string>).instanceName ?? ((integ?.metadata ?? {}) as Record<string, string>).instance_name;
      const url = Deno.env.get("EVOLUTION_API_URL"), key = Deno.env.get("EVOLUTION_API_KEY");
      if (!instance || !url || !key) return json({ error: "WhatsApp não está conectado: escolha uma integração conectada" }, 400);
      const cfg: WhatsAppConfig = { evolutionApiUrl: url, evolutionApiKey: key, instanceName: instance };
      const isReact = body.kind === 'reactivation';
      result = await sendWhatsAppMessage(cfg, phone, `🧪 *Teste* (exemplo, não é ${isReact ? 'uma reativação real' : 'um pedido real'})\n\n${isReact ? renderReactivation(template) : renderTemplate(template, SAMPLE)}`);
      sentTo = phone;
    } else {
      const to = normEmail(typeof body.to === "string" ? body.to : "");
      if (!to) return json({ error: "E-mail inválido" }, 400);
      const integrationId = typeof body.email_integration_id === "string" ? body.email_integration_id : "";
      const { data: owned } = await supabase.from("email_integrations").select("id").eq("id", integrationId).eq("tenant_id", auth.tenantId).maybeSingle();
      if (!owned) return json({ error: "Escolha uma integração de e-mail" }, 400);
      const { config: emailCfg, error: cfgErr } = await getEmailConfig(supabase as unknown as Parameters<typeof getEmailConfig>[0], integrationId);
      if (!emailCfg) return json({ error: cfgErr || "Integração de e-mail indisponível" }, 400);
      const subjectTpl = typeof body.email_subject === "string" && body.email_subject.trim() ? body.email_subject : "Atualização do Pedido #{{numero_pedido}}";
      const bodyTpl = typeof body.email_body === "string" && body.email_body.trim() ? body.email_body : `<p>${template.split("\n").join("<br>")}</p>`;
      result = await sendEmail(emailCfg, {
        to, subject: `[TESTE] ${renderTemplate(subjectTpl.slice(0, 300), SAMPLE)}`,
        text: renderTemplate(template, SAMPLE), html: renderTemplate(bodyTpl.slice(0, MAX_TEXT), SAMPLE, true),
      });
      sentTo = to;
    }

    if (!result.success) return json({ error: result.error || "Não foi possível enviar o teste" }, 502);
    await supabase.rpc("deduct_tokens", { _tenant_id: auth.tenantId, _amount: 1, _type: "auto_message", _description: "Teste de notificação de pedido", _reference_id: null });
    return json({ success: true, sent_to: sentTo });
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("Erro em order-notification-test", err);
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
