import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

function uuid() {
  return crypto.randomUUID();
}

interface FlowDef {
  name: string;
  description: string;
  nodes: { id: string; type: string; label: string; config: Record<string, unknown>; x: number; y: number; isEntry: boolean }[];
  edges: { source: string; target: string; sourceHandle?: string; label?: string }[];
}

function buildFlows(): FlowDef[] {
  // ---- FLOW 1: Boas-vindas + Captura de Lead ----
  const f1n = {
    trigger: uuid(), typing1: uuid(), welcome: uuid(), askName: uuid(),
    askEmail: uuid(), askPhone: uuid(), consent: uuid(),
    tagLead: uuid(), setField: uuid(), notify: uuid(), thanks: uuid(), end1: uuid(),
  };
  const flow1: FlowDef = {
    name: "🟢 Boas-vindas + Captura de Lead",
    description: "Fluxo completo: saudação → coleta nome/email/telefone → consentimento → tag → notifica equipe",
    nodes: [
      { id: f1n.trigger, type: "trigger", label: "Primeira DM", config: { trigger_type: "dm_first_message", throttle_mode: "once_per_contact", priority: 10 }, x: 300, y: 0, isEntry: true },
      { id: f1n.typing1, type: "sender_action_typing_on", label: "Digitando...", config: {}, x: 300, y: 100, isEntry: false },
      { id: f1n.welcome, type: "send_text", label: "Mensagem de Boas-vindas", config: { text: "Olá! 👋 Bem-vindo(a) ao nosso Instagram!\n\nFicamos felizes com sua mensagem. Vou te fazer algumas perguntas rápidas para podermos te atender melhor.", typing_indicator: true }, x: 300, y: 200 },
      { id: f1n.askName, type: "collect_text", label: "Perguntar Nome", config: { prompt: "Primeiro, como posso te chamar? 😊", save_field: "first_name", max_retries: 2 }, x: 300, y: 320 },
      { id: f1n.askEmail, type: "collect_email", label: "Coletar E-mail", config: { prompt: "Ótimo, {{first_name}}! Qual seu melhor e-mail?", error_message: "Hmm, esse e-mail não parece válido. Pode digitar novamente?", max_retries: 3 }, x: 300, y: 440 },
      { id: f1n.askPhone, type: "collect_phone", label: "Coletar Telefone", config: { prompt: "E seu WhatsApp com DDD? (Ex: 11999998888)", error_message: "Formato inválido. Digite apenas números com DDD.", max_retries: 3 }, x: 300, y: 560 },
      { id: f1n.consent, type: "collect_consent", label: "Pedir Consentimento", config: { consent_text: "Posso enviar promoções e novidades por WhatsApp e e-mail?", accept_text: "Sim, quero receber! ✅", decline_text: "Não, obrigado" }, x: 300, y: 680 },
      { id: f1n.tagLead, type: "add_tag", label: "Tag: Lead IG", config: { tag_name: "lead_instagram" }, x: 300, y: 800 },
      { id: f1n.setField, type: "set_contact_field", label: "Definir Origem", config: { field_name: "origem", field_value: "instagram_dm" }, x: 300, y: 900 },
      { id: f1n.notify, type: "handoff_to_human", label: "Notificar Equipe", config: { message: "Obrigado pelos dados, {{first_name}}! 🎉\n\nUm especialista da nossa equipe vai entrar em contato em breve. Enquanto isso, fique à vontade para explorar nosso perfil!", notify_team: true }, x: 300, y: 1020 },
      { id: f1n.thanks, type: "send_text", label: "Mensagem Final", config: { text: "Até logo! 👋✨" }, x: 300, y: 1140 },
      { id: f1n.end1, type: "end", label: "Fim", config: {}, x: 300, y: 1240 },
    ],
    edges: [
      { source: f1n.trigger, target: f1n.typing1 },
      { source: f1n.typing1, target: f1n.welcome },
      { source: f1n.welcome, target: f1n.askName },
      { source: f1n.askName, target: f1n.askEmail },
      { source: f1n.askEmail, target: f1n.askPhone },
      { source: f1n.askPhone, target: f1n.consent },
      { source: f1n.consent, target: f1n.tagLead },
      { source: f1n.tagLead, target: f1n.setField },
      { source: f1n.setField, target: f1n.notify },
      { source: f1n.notify, target: f1n.thanks },
      { source: f1n.thanks, target: f1n.end1 },
    ],
  };

  // ---- FLOW 2: Resposta a Comentário ----
  const f2n = {
    trigger: uuid(), replyPub: uuid(), wait2: uuid(), dmPriv: uuid(), link: uuid(), tagEngaged: uuid(), end2: uuid(),
  };
  const flow2: FlowDef = {
    name: "💬 Resposta a Comentário",
    description: "Reply público no comentário + DM privada com link e oferta exclusiva",
    nodes: [
      { id: f2n.trigger, type: "trigger", label: "Comentário em Post", config: { trigger_type: "post_comment", throttle_mode: "once_per_24h", priority: 8 }, x: 300, y: -120, isEntry: true },
      { id: f2n.replyPub, type: "send_comment_reply_public", label: "Reply Público", config: { text: "Que bom ver você por aqui! 🔥 Acabei de te enviar uma mensagem no Direct com uma oferta especial!" }, x: 300, y: 0, isEntry: false },
      { id: f2n.wait2, type: "wait", label: "Esperar 3s", config: { wait_type: "delay", seconds: 3 }, x: 300, y: 120 },
      { id: f2n.dmPriv, type: "send_private_reply", label: "DM Privada", config: { text: "Oi! Vi que você curtiu nosso post! 😍\n\nTenho uma oferta exclusiva pra quem interagiu:" }, x: 300, y: 240 },
      { id: f2n.link, type: "open_url_button", label: "Botão de Oferta", config: { button_text: "🎁 Ver Oferta Exclusiva", url: "https://sualoja.com/promo?utm_source=instagram&utm_medium=dm&utm_campaign=comment_reply", track_clicks: true }, x: 300, y: 360 },
      { id: f2n.tagEngaged, type: "add_tag", label: "Tag: Engajado", config: { tag_name: "engajou_comentario" }, x: 300, y: 480 },
      { id: f2n.end2, type: "end", label: "Fim", config: {}, x: 300, y: 580 },
    ],
    edges: [
      { source: f2n.trigger, target: f2n.replyPub },
      { source: f2n.replyPub, target: f2n.wait2 },
      { source: f2n.wait2, target: f2n.dmPriv },
      { source: f2n.dmPriv, target: f2n.link },
      { source: f2n.link, target: f2n.tagEngaged },
      { source: f2n.tagEngaged, target: f2n.end2 },
    ],
  };

  // ---- FLOW 3: Menu Interativo ----
  const f3n = {
    trigger: uuid(), menu: uuid(), waitResp: uuid(), cond1: uuid(), cond2: uuid(),
    catalog: uuid(), support: uuid(), promo: uuid(),
    imgCatalog: uuid(), handoff: uuid(), promoLink: uuid(),
    endCat: uuid(), endSup: uuid(), endPromo: uuid(),
  };
  const flow3: FlowDef = {
    name: "📋 Menu Interativo",
    description: "Quick replies com 3 opções: Catálogo, Suporte e Promoções – cada uma leva a um caminho diferente",
    nodes: [
      { id: f3n.trigger, type: "trigger", label: "Qualquer DM", config: { trigger_type: "dm_any_message", throttle_mode: "always", priority: 5 }, x: 400, y: -120, isEntry: true },
      { id: f3n.menu, type: "send_quick_replies", label: "Menu Principal", config: { text: "Olá! Como posso te ajudar hoje? Escolha uma opção:", buttons: [{ title: "📦 Catálogo" }, { title: "🎧 Suporte" }, { title: "🎁 Promoções" }] }, x: 400, y: 0, isEntry: false },
      { id: f3n.cond1, type: "condition_if_else", label: "É Catálogo?", config: { field: "message_text", operator: "contains", value: "Catálogo", case_insensitive: true }, x: 400, y: 240 },
      { id: f3n.catalog, type: "send_text", label: "Resp. Catálogo", config: { text: "Aqui está nosso catálogo completo! 📦✨\n\nTemos mais de 200 produtos disponíveis. Confira:" }, x: 150, y: 380 },
      { id: f3n.imgCatalog, type: "send_image", label: "Imagem Catálogo", config: { url: "https://via.placeholder.com/800x600/4F46E5/fff?text=Catalogo+2025", caption: "Catálogo Verão 2025" }, x: 150, y: 500 },
      { id: f3n.endCat, type: "end", label: "Fim Catálogo", config: {}, x: 150, y: 620 },
      { id: f3n.cond2, type: "condition_if_else", label: "É Suporte?", config: { field: "message_text", operator: "contains", value: "Suporte", case_insensitive: true }, x: 650, y: 380 },
      { id: f3n.support, type: "send_text", label: "Resp. Suporte", config: { text: "Entendido! Vou te conectar com nosso time de suporte. 🎧\n\nUm atendente vai te responder em instantes." }, x: 450, y: 520 },
      { id: f3n.handoff, type: "handoff_to_human", label: "Transferir Suporte", config: { message: "Conversa transferida para atendimento humano", notify_team: true }, x: 450, y: 640 },
      { id: f3n.endSup, type: "end", label: "Fim Suporte", config: {}, x: 450, y: 760 },
      { id: f3n.promo, type: "send_text", label: "Resp. Promoções", config: { text: "Temos promoções incríveis essa semana! 🎁🔥" }, x: 850, y: 520 },
      { id: f3n.promoLink, type: "open_url_button", label: "Link Promoções", config: { button_text: "🛒 Ver Promoções", url: "https://sualoja.com/promocoes?utm_source=ig_bot", track_clicks: true }, x: 850, y: 640 },
      { id: f3n.endPromo, type: "end", label: "Fim Promoções", config: {}, x: 850, y: 760 },
    ],
    edges: [
      { source: f3n.trigger, target: f3n.menu },
      { source: f3n.menu, target: f3n.waitResp },
      { source: f3n.waitResp, target: f3n.cond1 },
      { source: f3n.cond1, target: f3n.catalog, sourceHandle: "true", label: "Catálogo" },
      { source: f3n.catalog, target: f3n.imgCatalog },
      { source: f3n.imgCatalog, target: f3n.endCat },
      { source: f3n.cond1, target: f3n.cond2, sourceHandle: "false" },
      { source: f3n.cond2, target: f3n.support, sourceHandle: "true", label: "Suporte" },
      { source: f3n.support, target: f3n.handoff },
      { source: f3n.handoff, target: f3n.endSup },
      { source: f3n.cond2, target: f3n.promo, sourceHandle: "false", label: "Promoções" },
      { source: f3n.promo, target: f3n.promoLink },
      { source: f3n.promoLink, target: f3n.endPromo },
    ],
  };

  // ---- FLOW 4: Qualificação com A/B Test ----
  const f4n = {
    trigger: uuid(), intro: uuid(), askInterest: uuid(), waitInt: uuid(), condProdA: uuid(),
    pathA: uuid(), pathB: uuid(), splitAB: uuid(),
    variantA: uuid(), variantB: uuid(),
    collectNum: uuid(), tagHot: uuid(), deal: uuid(), event: uuid(),
    pauseAuto: uuid(), end4a: uuid(), end4b: uuid(),
  };
  const flow4: FlowDef = {
    name: "🎯 Qualificação + Teste A/B",
    description: "Qualifica interesse → condição if/else → split A/B para testar mensagens → cria deal + evento",
    nodes: [
      { id: f4n.trigger, type: "trigger", label: "Palavra-chave", config: { trigger_type: "dm_keyword", keywords: ["quero", "preço", "comprar"], keyword_match_mode: "contains", throttle_mode: "once_per_24h", priority: 15 }, x: 400, y: -120, isEntry: true },
      { id: f4n.intro, type: "send_text", label: "Introdução", config: { text: "Oi! 😊 Vi que você tem interesse nos nossos produtos.\n\nPosso te ajudar a encontrar o ideal pra você?" }, x: 400, y: 0, isEntry: false },
      { id: f4n.askInterest, type: "send_quick_replies", label: "Pergunta Interesse", config: { text: "O que mais te interessa?", buttons: [{ title: "🏠 Produto A" }, { title: "🚗 Produto B" }, { title: "💰 Preços" }] }, x: 400, y: 120 },
      { id: f4n.waitInt, type: "wait", label: "Aguardar", config: { wait_type: "user_input", timeout_seconds: 600 }, x: 400, y: 240 },
      { id: f4n.condProdA, type: "condition_if_else", label: "Produto A?", config: { field: "message_text", operator: "contains", value: "Produto A", case_insensitive: true }, x: 400, y: 360 },
      { id: f4n.pathA, type: "send_text", label: "Info Produto A", config: { text: "Excelente escolha! 🏠\n\nO Produto A é nosso mais vendido, com avaliação de 4.9⭐\n\nPreço especial: R$ 297,00" }, x: 150, y: 500 },
      { id: f4n.pathB, type: "send_text", label: "Info Produto B", config: { text: "Ótima escolha! 🚗\n\nO Produto B tem entrega expressa e garantia estendida.\n\nPreço especial: R$ 497,00" }, x: 650, y: 500 },
      { id: f4n.splitAB, type: "split_random", label: "Teste A/B CTA", config: { percentage: 50 }, x: 400, y: 640 },
      { id: f4n.variantA, type: "send_text", label: "CTA Variante A", config: { text: "⚡ Oferta por tempo limitado! Responda \"QUERO\" para garantir." }, x: 200, y: 780 },
      { id: f4n.variantB, type: "send_text", label: "CTA Variante B", config: { text: "🎁 Compre agora e ganhe frete grátis! Digite \"COMPRAR\" para prosseguir." }, x: 600, y: 780 },
      { id: f4n.collectNum, type: "collect_number", label: "Coletar Quantidade", config: { prompt: "Quantas unidades deseja?", error_message: "Por favor, digite apenas o número.", max_retries: 2 }, x: 400, y: 920 },
      { id: f4n.tagHot, type: "add_tag", label: "Tag: Lead Quente", config: { tag_name: "lead_quente" }, x: 400, y: 1040 },
      { id: f4n.deal, type: "create_deal", label: "Criar Oportunidade", config: { deal_name: "Venda IG - {{first_name}}", deal_value: 297 }, x: 400, y: 1140 },
      { id: f4n.event, type: "emit_internal_event", label: "Evento: Intent", config: { event_name: "purchase_intent", payload: '{"source": "instagram", "qualified": true}' }, x: 400, y: 1240 },
      { id: f4n.pauseAuto, type: "pause_all_automations", label: "Pausar Automações", config: { duration: "1d" }, x: 400, y: 1340 },
      { id: f4n.end4a, type: "end", label: "Fim A", config: {}, x: 400, y: 1440 },
    ],
    edges: [
      { source: f4n.trigger, target: f4n.intro },
      { source: f4n.intro, target: f4n.askInterest },
      { source: f4n.askInterest, target: f4n.waitInt },
      { source: f4n.waitInt, target: f4n.condProdA },
      { source: f4n.condProdA, target: f4n.pathA, sourceHandle: "true", label: "Produto A" },
      { source: f4n.condProdA, target: f4n.pathB, sourceHandle: "false", label: "Outros" },
      { source: f4n.pathA, target: f4n.splitAB },
      { source: f4n.pathB, target: f4n.splitAB },
      { source: f4n.splitAB, target: f4n.variantA, sourceHandle: "true", label: "50% A" },
      { source: f4n.splitAB, target: f4n.variantB, sourceHandle: "false", label: "50% B" },
      { source: f4n.variantA, target: f4n.collectNum },
      { source: f4n.variantB, target: f4n.collectNum },
      { source: f4n.collectNum, target: f4n.tagHot },
      { source: f4n.tagHot, target: f4n.deal },
      { source: f4n.deal, target: f4n.event },
      { source: f4n.event, target: f4n.pauseAuto },
      { source: f4n.pauseAuto, target: f4n.end4a },
    ],
  };

  return [flow1, flow2, flow3, flow4];
}

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-seed-test-flows", cid);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { effectiveTenantId, channel_id } = await req.json();
    if (!channel_id) {
      return new Response(JSON.stringify({ error: "channel_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const effectiveTenantId = tenant_id || authTenantId;

    const flowDefs = buildFlows();
    const createdFlows: string[] = [];

    for (const def of flowDefs) {
      // Create flow
      const flowId = uuid();
      const { error: flowErr } = await supabase.from("instagram_flows").insert({
        id: flowId,
        effectiveTenantId,
        channel_id,
        name: def.name,
        description: def.description,
        status: "draft",
      });
      if (flowErr) {
        log.error("Flow insert error:", flowErr);
        continue;
      }

      // Create draft version
      const versionId = uuid();
      const { error: verErr } = await supabase.from("instagram_flow_versions").insert({
        id: versionId,
        effectiveTenantId,
        flow_id: flowId,
        version_number: 1,
        status: "draft",
      });
      if (verErr) {
        log.error("Version insert error:", verErr);
        continue;
      }

      // Insert nodes
      if (def.nodes.length > 0) {
        const nodeRows = def.nodes.map(n => ({
          id: n.id,
          effectiveTenantId,
          version_id: versionId,
          node_type: n.type,
          label: n.label,
          config: n.config,
          position_x: n.x,
          position_y: n.y,
          is_entry: n.isEntry === true ? true : false,
        }));
        const { error: nErr } = await supabase.from("instagram_flow_nodes").insert(nodeRows);
        if (nErr) log.error("Nodes insert error:", nErr);
      }

      // Insert edges
      if (def.edges.length > 0) {
        const edgeRows = def.edges.map(e => ({
          id: uuid(),
          effectiveTenantId,
          version_id: versionId,
          source_node_id: e.source,
          target_node_id: e.target,
          source_handle: e.sourceHandle || null,
          label: e.label || null,
          condition: null,
        }));
        const { error: eErr } = await supabase.from("instagram_flow_edges").insert(edgeRows);
        if (eErr) log.error("Edges insert error:", eErr);
      }

      createdFlows.push(flowId);
    }

    return new Response(JSON.stringify({
      success: true,
      flows_created: createdFlows.length,
      flow_ids: createdFlows,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error("Seed error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
