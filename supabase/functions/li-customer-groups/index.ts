import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { liAuthHeader } from "../_shared/li-auth.ts";

const BASE = "https://api.awsli.com.br/v1";
interface LiGroup { id: number; nome: string; padrao: boolean }
interface Member { li_customer_id: number; email: string | null; current_group: string | null }

async function listGroups(auth: string): Promise<LiGroup[]> {
  const out: LiGroup[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const res = await fetch(`${BASE}/grupo?limit=100&offset=${offset}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Loja Integrada respondeu ${res.status} ao listar os grupos`);
    const j = await res.json() as { objects?: LiGroup[]; meta?: { next?: string | null } };
    out.push(...(j.objects ?? []));
    if (!j.meta?.next) break;
  }
  return out;
}

async function members(supabase: ReturnType<typeof createClient>, tenantId: string, audienceId: string): Promise<Member[]> {
  const { data, error } = await supabase.rpc("get_rfm_audience_li_customers", { p_tenant_id: tenantId, p_audience_id: audienceId });
  if (error) throw error;
  return (data ?? []) as Member[];
}

/**
 * Grupos de clientes da Loja Integrada.
 *  { action: "groups" }                                 → grupos da loja
 *  { action: "preview", audienceId, group }             → quantos clientes da audiência RFM seriam movidos e de onde
 *  { action: "start", audienceId, group, confirm:true } → cria o trabalho em segundo plano (li-marketing-jobs, 1 por minuto)
 *  { action: "jobs" } / { action: "cancel", jobId } / { action: "undo", jobId }
 * Mudar o grupo pode mudar preços na loja: só com confirmação, guardando o grupo anterior de cada cliente para desfazer.
 */
Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const log = createLogger("li-customer-groups", getCorrelationId(req));

  try {
    const { tenantId, userId } = await requireUserAuth(req);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json().catch(() => ({})) as { action?: string; audienceId?: string; group?: string; confirm?: boolean; jobId?: string };

    const { data: integ } = await supabase.from("integrations").select("id, api_key").eq("tenant_id", tenantId).eq("type", "loja_integrada").eq("status", "connected").limit(1).maybeSingle();
    if (!integ?.api_key) return json({ success: false, error: "Conecte a Loja Integrada em Integrações." }, 400);
    const auth = liAuthHeader(integ.api_key);

    if (b.action === "groups") return json({ success: true, groups: await listGroups(auth) });

    if (b.action === "jobs") {
      const { data } = await supabase.from("li_group_jobs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(10);
      return json({ success: true, jobs: data ?? [] });
    }

    if (b.action === "cancel") {
      const { error } = await supabase.from("li_group_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", b.jobId ?? "").eq("tenant_id", tenantId).eq("status", "running");
      if (error) throw error;
      return json({ success: true });
    }

    const { count: running } = await supabase.from("li_group_jobs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "running");

    if (b.action === "preview" || b.action === "start") {
      if (!b.audienceId || !b.group) return json({ success: false, error: "Escolha a audiência e o grupo." }, 400);
      const groups = await listGroups(auth);
      const target = groups.find((g) => g.nome === b.group);
      if (!target) return json({ success: false, error: "Esse grupo não existe na loja. Crie o grupo no painel da Loja Integrada primeiro." }, 400);
      const list = await members(supabase, tenantId, b.audienceId);
      const toMove = list.filter((m) => m.current_group !== target.nome);
      const from: Record<string, number> = {};
      for (const m of toMove) from[m.current_group ?? "(sem grupo)"] = (from[m.current_group ?? "(sem grupo)"] ?? 0) + 1;

      if (b.action === "preview") return json({ success: true, members: list.length, alreadyInGroup: list.length - toMove.length, toMove: toMove.length, from, running: running ?? 0 });

      if (b.confirm !== true) return json({ success: false, error: "Confirme a alteração." }, 400);
      if ((running ?? 0) > 0) return json({ success: false, error: "Já há uma alteração de grupos em andamento. Espere terminar ou cancele." }, 409);
      if (!toMove.length) return json({ success: false, error: "Todos os clientes dessa audiência já estão nesse grupo." }, 400);

      const { data: job, error: jobErr } = await supabase.from("li_group_jobs").insert({
        tenant_id: tenantId, integration_id: integ.id, label: `Audiência → grupo "${target.nome}"`, target_group: target.nome, total: toMove.length, created_by: userId,
      }).select("id").single();
      if (jobErr) throw jobErr;
      for (let i = 0; i < toMove.length; i += 500) {
        const { error } = await supabase.from("li_group_job_items").insert(toMove.slice(i, i + 500).map((m) => ({ job_id: job.id, tenant_id: tenantId, li_customer_id: m.li_customer_id, email: m.email, previous_group: m.current_group })));
        if (error) throw error;
      }
      log.info(`[GROUPS] job ${job.id}: ${toMove.length} clientes → "${target.nome}"`);
      return json({ success: true, jobId: job.id, total: toMove.length });
    }

    if (b.action === "undo") {
      if ((running ?? 0) > 0) return json({ success: false, error: "Espere o trabalho em andamento terminar (ou cancele) antes de desfazer." }, 409);
      const { data: src } = await supabase.from("li_group_jobs").select("id, label, undone_at, undo_of").eq("id", b.jobId ?? "").eq("tenant_id", tenantId).maybeSingle();
      if (!src) return json({ success: false, error: "Trabalho não encontrado." }, 404);
      if (src.undone_at || src.undo_of) return json({ success: false, error: "Este trabalho já foi desfeito (ou é um desfazer)." }, 400);
      const items: { li_customer_id: number; email: string | null; previous_group: string | null; new_group: string | null }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase.from("li_group_job_items").select("li_customer_id, email, previous_group, new_group").eq("job_id", src.id).eq("status", "done").range(from, from + 999);
        items.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const back = items.filter((i) => i.previous_group);
      if (!back.length) return json({ success: false, error: "Nada para desfazer: nenhum cliente foi alterado." }, 400);
      const { data: job, error } = await supabase.from("li_group_jobs").insert({ tenant_id: tenantId, integration_id: integ.id, label: `Desfazer: ${src.label}`, target_group: null, total: back.length, undo_of: src.id, created_by: userId }).select("id").single();
      if (error) throw error;
      for (let i = 0; i < back.length; i += 500) {
        const { error: e2 } = await supabase.from("li_group_job_items").insert(back.slice(i, i + 500).map((m) => ({ job_id: job.id, tenant_id: tenantId, li_customer_id: m.li_customer_id, email: m.email, previous_group: m.new_group, new_group: m.previous_group })));
        if (e2) throw e2;
      }
      await supabase.from("li_group_jobs").update({ undone_at: new Date().toISOString() }).eq("id", src.id);
      return json({ success: true, jobId: job.id, total: back.length });
    }

    return json({ success: false, error: "Ação desconhecida" }, 400);
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    log.error("[GROUPS]", error);
    return json({ success: false, error: (error as Error)?.message ?? "erro" }, 500);
  }
});
