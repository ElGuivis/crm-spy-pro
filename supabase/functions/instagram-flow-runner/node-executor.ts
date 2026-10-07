/**
 * Execução de cada tipo de nó do fluxo do Instagram (texto, botões, condição, espera, IA...).
 * Separado do index.ts, que cuida só de carregar a execução e percorrer o grafo.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface NodeResult { status?: string; action?: string; output?: Record<string, unknown>; contextUpdates?: Record<string, unknown>; selectedHandle?: string; waitSeconds?: number }

export async function executeNode(supabase: ReturnType<typeof createClient>, node: { id: string; node_type: string; config: Record<string, unknown> }, context: Record<string, unknown>, run: Record<string, unknown>): Promise<NodeResult> {
  const config = node.config || {};

  switch (node.node_type) {
    case "send_text": {
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: interpolate(config.text || "", context),
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "send_image":
    case "send_video": {
      // Placeholder - sends text with media URL
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: config.caption || config.url || "",
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "send_quick_replies": {
      const text = interpolate(config.text || "", context);
      const options = (config.options as { label: string }[] || []).map((o) => o.label).join("\n");
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: `${text}\n\n${options}`,
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "wait": {
      return {
        action: "wait",
        waitSeconds: config.seconds || 60,
        status: "completed",
      };
    }

    case "condition_if_else": {
      const field = config.field || "";
      const operator = config.operator || "equals";
      const value = config.value || "";
      const contextVal = String(getNestedValue(context, field) || "");

      let result = false;
      switch (operator) {
        case "equals": result = contextVal === value; break;
        case "not_equals": result = contextVal !== value; break;
        case "contains": result = contextVal.includes(value); break;
        case "not_contains": result = !contextVal.includes(value); break;
        case "exists": result = contextVal !== "" && contextVal !== "undefined"; break;
        case "not_exists": result = contextVal === "" || contextVal === "undefined"; break;
      }

      return {
        status: "completed",
        selectedHandle: result ? "true" : "false",
        output: { condition_result: result },
      };
    }

    case "split_random": {
      const variants = (config.variants as { handle: string; weight?: number }[]) || [{ handle: "a", weight: 50 }, { handle: "b", weight: 50 }];
      const totalWeight = variants.reduce((sum: number, v) => sum + (v.weight || 1), 0);
      let random = Math.random() * totalWeight;
      let selectedHandle = variants[0].handle;
      for (const v of variants) {
        random -= (v.weight || 1);
        if (random <= 0) { selectedHandle = v.handle; break; }
      }
      return { status: "completed", selectedHandle };
    }

    case "set_contact_field": {
      return {
        status: "completed",
        contextUpdates: { [config.field || "custom"]: config.value || "" },
      };
    }

    case "add_tag": {
      if (config.tag_id) {
        await supabase.from("instagram_contact_tags").upsert({
          tenant_id: run.tenant_id,
          contact_id: run.contact_id,
          tag_id: config.tag_id,
        }, { onConflict: "contact_id,tag_id" });
      }
      return { status: "completed" };
    }

    case "remove_tag": {
      if (config.tag_id) {
        await supabase.from("instagram_contact_tags")
          .delete()
          .eq("contact_id", run.contact_id)
          .eq("tag_id", config.tag_id);
      }
      return { status: "completed" };
    }

    case "assign_operator": {
      if (config.user_id) {
        await supabase.from("instagram_threads").update({
          assigned_user_id: config.user_id,
        }).eq("id", run.thread_id);
      }
      return { status: "completed" };
    }

    case "handoff_to_human": {
      return { action: "handoff", status: "completed" };
    }

    case "resume_bot": {
      await supabase.from("instagram_threads").update({
        current_mode: "bot_active",
      }).eq("id", run.thread_id);
      return { status: "completed" };
    }

    case "pause_all_automations": {
      const duration = config.duration || "indefinite";
      let pausedUntil: string | null = null;
      if (duration !== "indefinite") {
        const ms = parseDuration(duration);
        pausedUntil = new Date(Date.now() + ms).toISOString();
      }

      await supabase.from("instagram_contact_pauses").insert({
        tenant_id: run.tenant_id,
        contact_id: run.contact_id,
        channel_id: run.context?.channel_id || "",
        paused_until: pausedUntil,
        reason: config.reason || "Paused by automation",
        source: "automation",
      });

      return { action: "pause_contact", status: "completed" };
    }

    case "resume_all_automations": {
      await supabase.from("instagram_contact_pauses")
        .delete()
        .eq("contact_id", run.contact_id);
      return { status: "completed" };
    }

    case "create_task":
    case "create_deal":
    case "emit_internal_event": {
      // Log to event_log
      await supabase.from("instagram_event_log").insert({
        tenant_id: run.tenant_id,
        channel_id: run.context?.channel_id || "",
        event_type: node.node_type,
        payload: { ...config, run_id: run.id, contact_id: run.contact_id },
      });
      return { status: "completed" };
    }

    case "end": {
      return { action: "end", status: "completed" };
    }

    case "send_private_reply": {
      const text = interpolate(config.text || "", context);
      await supabase.functions.invoke("instagram-send-private-reply", {
        body: {
          channel_id: run.context?.channel_id || "",
          comment_id: context.comment_id || config.comment_id || "",
          text,
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "send_comment_reply_public": {
      const text = interpolate(config.text || "", context);
      await supabase.functions.invoke("instagram-send-comment-reply", {
        body: {
          channel_id: run.context?.channel_id || "",
          comment_id: context.comment_id || config.comment_id || "",
          text,
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "sender_action_typing_on":
    case "sender_action_typing_off":
    case "sender_action_mark_seen": {
      const actionMap: Record<string, string> = {
        sender_action_typing_on: "typing_on",
        sender_action_typing_off: "typing_off",
        sender_action_mark_seen: "mark_seen",
      };
      // Send sender action via Instagram API (through send-message with sender_action)
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          sender_action: actionMap[node.node_type],
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "collect_email":
    case "collect_phone":
    case "collect_text":
    case "collect_number": {
      // Send prompt message
      const prompt = interpolate(config.prompt || config.text || "", context);
      if (prompt) {
        await supabase.functions.invoke("instagram-send-message", {
          body: {
            channel_id: run.context?.channel_id || "",
            contact_id: run.contact_id,
            thread_id: run.thread_id,
            text: prompt,
            idempotency_key: `flow:${run.id}:${node.id}:prompt`,
          },
        });
      }
      // Wait for user response - the flow will be resumed when user replies
      return {
        action: "wait",
        waitSeconds: config.timeout_seconds || 3600,
        status: "completed",
        contextUpdates: { awaiting_collection: node.node_type, collection_field: config.field || node.node_type.replace("collect_", "") },
      };
    }

    case "collect_consent": {
      const consentText = interpolate(config.text || "Você concorda em compartilhar seus dados?", context);
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: consentText,
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      // Record consent event
      await supabase.from("instagram_data_collection_events").insert({
        tenant_id: run.tenant_id,
        contact_id: run.contact_id,
        channel_id: run.context?.channel_id || "",
        field_name: "consent",
        field_value: "requested",
        source: "flow",
        flow_id: run.flow_id,
        flow_run_id: run.id,
        node_id: node.id,
        consent_given: false,
        consent_text: config.consent_label || consentText,
      });
      return { status: "completed" };
    }

    case "send_audio": {
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: config.url || config.caption || "",
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "send_card":
    case "send_gallery":
    case "send_dynamic_content": {
      // Send as formatted text (Instagram DM API limitations)
      const content = interpolate(config.text || config.title || "", context);
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: content,
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    case "open_url_button": {
      const urlText = interpolate(config.label || "Clique aqui", context);
      const url = interpolate(config.url || "", context);
      const message = `${urlText}\n${url}`;
      
      // Create CTA tracking if configured
      if (config.track_clicks && url) {
        await supabase.functions.invoke("instagram-create-cta-link", {
          body: {
            tenant_id: run.tenant_id,
            channel_id: run.context?.channel_id || "",
            label: urlText,
            url,
            ref_key: config.ref_key,
            flow_id: run.flow_id,
            node_id: node.id,
          },
        });
      }
      
      await supabase.functions.invoke("instagram-send-message", {
        body: {
          channel_id: run.context?.channel_id || "",
          contact_id: run.contact_id,
          thread_id: run.thread_id,
          text: message,
          idempotency_key: `flow:${run.id}:${node.id}`,
        },
      });
      return { status: "completed" };
    }

    default:
      return { status: "completed", output: { warning: `Unknown node type: ${node.node_type}` } };
  }
}

function interpolate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    return String(getNestedValue(context, key) || "");
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((o: unknown, k: string) => (o as Record<string, unknown>)?.[k], obj);
}

function parseDuration(d: string): number {
  const map: Record<string, number> = {
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "3h": 3 * 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
  };
  return map[d] || 60 * 60 * 1000;
}
