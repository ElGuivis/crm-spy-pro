import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireInternalAuth } from "../_shared/auth-guard.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface FlowNode {
  id: string;
  node_type: string;
  label: string | null;
  config: Record<string, unknown>;
  is_entry: boolean;
}

interface FlowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition: { source_handle?: string; type?: string; value?: string } | null;
}

export interface FlowSession {
  currentNodeId: string | null;
  pendingNodeId: string | null;  // question waiting for answer
  waitingForInput: boolean;
  variables: Record<string, string>;
}

interface RunResult {
  messages: string[];
  session: FlowSession;
  done: boolean;
  transferToHuman: boolean;
  error?: string;
}

function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function evalCondition(
  cfg: { variable: string; operator: string; value: string },
  vars: Record<string, string>,
): boolean {
  const actual = (vars[cfg.variable] ?? "").toLowerCase();
  const expected = (cfg.value ?? "").toLowerCase();
  switch (cfg.operator) {
    case "equals":      return actual === expected;
    case "not_equals":  return actual !== expected;
    case "contains":    return actual.includes(expected);
    case "starts_with": return actual.startsWith(expected);
    default:            return false;
  }
}

type StepResult = {
  messages: string[];
  nextNodeId: string | null;
  session: FlowSession;
  done: boolean;
  transferToHuman: boolean;
};

function processNode(
  node: FlowNode,
  edges: FlowEdge[],
  session: FlowSession,
  userInput: string | null,
): StepResult {
  const out = edges.filter((e) => e.source_node_id === node.id);
  const cfg = node.config as Record<string, unknown>;
  const vars = { ...session.variables };
  const messages: string[] = [];
  let nextNodeId: string | null = null;
  let done = false;
  let transferToHuman = false;

  switch (node.node_type) {
    case "start": {
      const txt = cfg.welcome_message as string | undefined;
      if (txt?.trim()) messages.push(interpolate(txt, vars));
      nextNodeId = out[0]?.target_node_id ?? null;
      break;
    }
    case "message": {
      const txt = cfg.text as string | undefined;
      if (txt?.trim()) messages.push(interpolate(txt, vars));
      nextNodeId = out[0]?.target_node_id ?? null;
      break;
    }
    case "question": {
      const buttons = (cfg.buttons as { id: string; label: string }[] | undefined) ?? [];
      if (!userInput && buttons.length > 0) {
        const txt = cfg.text as string | undefined;
        if (txt?.trim()) messages.push(interpolate(txt, vars));
        return {
          messages,
          nextNodeId: null,
          session: { ...session, variables: vars, waitingForInput: true, pendingNodeId: node.id },
          done: false,
          transferToHuman: false,
        };
      }
      // No buttons configured or already have input — fall through like a message node
      if (!userInput) {
        const txt = cfg.text as string | undefined;
        if (txt?.trim()) messages.push(interpolate(txt, vars));
        nextNodeId = out[0]?.target_node_id ?? null;
        break;
      }
      const matched = buttons.find(
        (b) =>
          b.label.toLowerCase() === userInput.toLowerCase() ||
          b.id === userInput,
      );
      const matchEdge =
        out.find((e) => e.condition?.source_handle === (matched?.id ?? "")) ??
        out.find((e) => e.condition?.source_handle === userInput) ??
        out[0];
      nextNodeId = matchEdge?.target_node_id ?? null;
      break;
    }
    case "condition": {
      const cond = cfg as { variable: string; operator: string; value: string };
      const res = evalCondition(cond, vars);
      const trueEdge  = out.find((e) => e.condition?.source_handle === "true"  || e.condition?.value === "true");
      const falseEdge = out.find((e) => e.condition?.source_handle === "false" || e.condition?.value === "false");
      nextNodeId = (res ? trueEdge : falseEdge)?.target_node_id ?? out[0]?.target_node_id ?? null;
      break;
    }
    case "action": {
      const actionType = cfg.action_type as string | undefined;
      if (actionType === "set_variable" && cfg.variable_name) {
        vars[cfg.variable_name as string] = String(cfg.variable_value ?? "");
      } else if (actionType === "transfer_human") {
        transferToHuman = true;
      }
      nextNodeId = out[0]?.target_node_id ?? null;
      break;
    }
    case "end": {
      const finalMsg = cfg.final_message as string | undefined;
      if (finalMsg?.trim()) messages.push(interpolate(finalMsg, vars));
      done = true;
      break;
    }
  }

  return {
    messages,
    nextNodeId,
    session: { ...session, variables: vars, waitingForInput: false, pendingNodeId: null },
    done,
    transferToHuman,
  };
}

async function runFlow(
  flowId: string,
  session: FlowSession,
  userInput: string | null,
): Promise<RunResult> {
  const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
    supabase.from("chatbot_flow_nodes").select("id,node_type,label,config,is_entry").eq("flow_id", flowId),
    supabase.from("chatbot_flow_edges").select("id,source_node_id,target_node_id,condition").eq("flow_id", flowId),
  ]);

  const nodes = (nodesData ?? []) as FlowNode[];
  const edges = (edgesData ?? []) as FlowEdge[];

  if (nodes.length === 0) {
    return { messages: [], session, done: true, transferToHuman: false };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const messages: string[] = [];
  let done = false;
  let transferToHuman = false;
  let currentSession = { ...session };

  let nodeId: string | null;
  if (session.waitingForInput && session.pendingNodeId) {
    nodeId = session.pendingNodeId;
  } else if (session.currentNodeId) {
    nodeId = session.currentNodeId;
  } else {
    nodeId = nodes.find((n) => n.is_entry)?.id ?? nodes[0].id;
  }

  let steps = 0;
  while (nodeId && steps < 12) {
    const node = nodeMap.get(nodeId);
    if (!node) break;

    const result = processNode(node, edges, currentSession, userInput);
    messages.push(...result.messages);
    currentSession = result.session;
    if (result.transferToHuman) transferToHuman = true;
    if (result.done) { done = true; break; }
    if (result.session.waitingForInput) break;

    nodeId = result.nextNodeId;
    currentSession = { ...currentSession, currentNodeId: nodeId };
    userInput = null;
    steps++;
  }

  return {
    messages,
    session: { ...currentSession, currentNodeId: nodeId },
    done,
    transferToHuman,
  };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

// Função interna: chamada só pelo whatsapp-webhook com a service role (sem uso no navegador, sem CORS).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  try {
    requireInternalAuth(req);
    let body: { flowId?: string; session?: FlowSession; userInput?: string | null };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: JSON_HEADERS });
    }
    const { flowId, session, userInput } = body;
    if (!flowId) return new Response(JSON.stringify({ error: "flowId required" }), { status: 400, headers: JSON_HEADERS });
    const emptySession: FlowSession = { currentNodeId: null, pendingNodeId: null, waitingForInput: false, variables: {} };
    const result = await runFlow(flowId, session ?? emptySession, userInput ?? null);
    return new Response(JSON.stringify(result), { headers: JSON_HEADERS });
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    console.error("flow-runner error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: JSON_HEADERS });
  }
});
