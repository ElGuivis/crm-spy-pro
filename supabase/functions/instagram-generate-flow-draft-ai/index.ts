import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

const SUPPORTED_NODE_TYPES = [
  "send_text", "send_image", "send_video", "send_quick_replies", "send_audio",
  "send_card", "send_gallery", "send_dynamic_content", "open_url_button",
  "wait", "condition_if_else", "split_random",
  "set_contact_field", "add_tag", "remove_tag",
  "assign_operator", "handoff_to_human", "resume_bot",
  "pause_all_automations", "resume_all_automations",
  "collect_email", "collect_phone", "collect_text", "collect_number", "collect_consent",
  "send_private_reply", "send_comment_reply_public",
  "sender_action_typing_on", "sender_action_typing_off", "sender_action_mark_seen",
  "create_task", "create_deal", "emit_internal_event", "end",
];

Deno.serve(async (req) => {
  const cid = getCorrelationId(req);
  const log = createLogger("instagram-generate-flow-draft-ai", cid);
  const corsHeaders = getRestrictedCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, tenantId: authTenantId } = await requireUserAuth(req);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const {
      tenant_id, channel_id, objective, trigger_type, tone, language,
      cta, data_fields, include_handoff,
    } = await req.json();

    if (!channel_id || !objective) throw new Error("Missing required fields");
    if (tenant_id) assertTenantMatch(authTenantId, tenant_id, req);
    const effectiveTenantId = authTenantId;

    await requireResource(supabase, "instagram_channels", channel_id, effectiveTenantId, req);

    const systemPrompt = `Você é um assistente especializado em criar fluxos de automação para Instagram DMs.
Sua tarefa é gerar um rascunho de fluxo compatível com o Flow Builder.

REGRAS RÍGIDAS:
1. Use APENAS estes tipos de nó: ${SUPPORTED_NODE_TYPES.join(", ")}
2. NUNCA publique ou ative nada - apenas gere o rascunho
3. NUNCA ative triggers
4. O primeiro nó deve ter is_entry: true
5. IDs devem ser UUIDs válidos
6. Posições devem ser razoáveis (x: 200-400, y: incrementando de 100 em 100)
7. Cada nó precisa ter node_type, label, config, position_x, position_y, is_entry
8. Edges precisam ter source_node_id e target_node_id
9. Se pedirem algo não suportado, avise no campo warnings
10. Tom de voz: ${tone || "profissional e amigável"}
11. Idioma dos textos: ${language || "pt-BR"}

Retorne um JSON com esta estrutura exata (use tool calling):
- nodes: array de nós
- edges: array de edges
- suggested_tags: array de nomes de tags sugeridas
- suggested_fields: array de campos sugeridos para captura
- checklist: array de strings com itens de revisão
- warnings: array de avisos sobre limitações
- validation: objeto com is_valid (boolean) e issues (array de strings)`;

    const userPrompt = `Crie um fluxo de automação com estas especificações:
- Objetivo: ${objective}
- Trigger: ${trigger_type || "qualquer"}
- CTA: ${cta || "nenhum específico"}
- Dados a capturar: ${(data_fields || []).join(", ") || "nenhum"}
- Incluir handoff humano: ${include_handoff ? "sim" : "não"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_flow_draft",
            description: "Generate a flow draft with nodes, edges, and metadata",
            parameters: {
              type: "object",
              properties: {
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      node_type: { type: "string" },
                      label: { type: "string" },
                      config: { type: "object" },
                      position_x: { type: "number" },
                      position_y: { type: "number" },
                      is_entry: { type: "boolean" },
                    },
                    required: ["id", "node_type", "label", "config", "position_x", "position_y", "is_entry"],
                  },
                },
                edges: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      source_node_id: { type: "string" },
                      target_node_id: { type: "string" },
                      source_handle: { type: "string" },
                    },
                    required: ["source_node_id", "target_node_id"],
                  },
                },
                suggested_tags: { type: "array", items: { type: "string" } },
                suggested_fields: { type: "array", items: { type: "string" } },
                checklist: { type: "array", items: { type: "string" } },
                warnings: { type: "array", items: { type: "string" } },
                validation: {
                  type: "object",
                  properties: {
                    is_valid: { type: "boolean" },
                    issues: { type: "array", items: { type: "string" } },
                  },
                },
              },
              required: ["nodes", "edges", "suggested_tags", "checklist", "validation"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_flow_draft" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido, tente novamente em alguns segundos" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return a valid response");

    let draft: Record<string, unknown>;
    try {
      draft = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    // Validate node types
    const unsupported = (draft.nodes || []).filter((n: Record<string, unknown>) => !SUPPORTED_NODE_TYPES.includes(n.node_type));
    if (unsupported.length > 0) {
      draft.warnings = draft.warnings || [];
      draft.warnings.push(`Nós não suportados removidos: ${unsupported.map((n: Record<string, unknown>) => n.node_type).join(", ")}`);
      draft.nodes = draft.nodes.filter((n: Record<string, unknown>) => SUPPORTED_NODE_TYPES.includes(n.node_type));
    }

    // Save draft to DB
    const { data: saved, error: sErr } = await supabase
      .from("instagram_ai_flow_drafts")
      .insert({
        tenant_id: effectiveTenantId,
        channel_id,
        objective,
        trigger_type,
        tone,
        language: language || "pt-BR",
        cta,
        data_fields: data_fields || [],
        include_handoff: include_handoff || false,
        generated_nodes: draft.nodes || [],
        generated_edges: draft.edges || [],
        suggested_tags: draft.suggested_tags || [],
        suggested_fields: draft.suggested_fields || [],
        validation_report: {
          validation: draft.validation,
          checklist: draft.checklist,
          warnings: draft.warnings,
        },
      })
      .select("id")
      .single();

    if (sErr) throw sErr;

    return new Response(JSON.stringify({ ok: true, draft_id: saved.id, ...draft }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    log.error("[generate-flow-draft-ai]", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message?.includes("Rate limit") ? 429 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
