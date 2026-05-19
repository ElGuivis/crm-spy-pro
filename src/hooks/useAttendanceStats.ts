import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subDays, format } from "date-fns";

export interface AttendanceStatsData {
  avgFirstResponseMin: number;
  avgResolutionMin: number;
  p50FirstResponseMin: number;
  p90FirstResponseMin: number;
  openConversations: number;
  closedThisMonth: number;
  closedLast30d: number;
  slaBreaches: number;
  csatAvg: number;
  csatCount: number;
  byStatus: { name: string; value: number }[];
  byDay: { date: string; opened: number; closed: number }[];
  byAgent: { name: string; conversations: number; avgResponseMin: number; closedCount: number }[];
  byHour: { hour: number; count: number }[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, idx)]);
}

async function fetchAttendanceStats(tenantId: string): Promise<AttendanceStatsData> {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30).toISOString();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { data: conversations },
    { data: messages },
    { count: openCount },
    { count: closedMonth },
    { count: closedLast30 },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("conversations") as any).select("id, status, created_at, closed_at, assigned_to, handoff_mode, inbox_id, csat_score").eq("tenant_id", tenantId).gte("created_at", thirtyDaysAgo).limit(1000) as unknown as Promise<{ data: Array<{ id: string; status: string; created_at: string; closed_at: string | null; assigned_to: string | null; handoff_mode: boolean; inbox_id: string | null; csat_score: number | null }> | null }>,
    supabase.from("messages").select("conversation_id, direction, created_at, sender_type").eq("tenant_id", tenantId).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: true }).limit(2000),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "closed"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "closed").gte("closed_at", startOfMonth),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "closed").gte("closed_at", thirtyDaysAgo),
  ]);

  // First response times per conversation
  const convMsgMap = new Map<string, { firstInbound?: Date; firstOutbound?: Date }>();
  for (const msg of messages || []) {
    if (!convMsgMap.has(msg.conversation_id)) convMsgMap.set(msg.conversation_id, {});
    const entry = convMsgMap.get(msg.conversation_id)!;
    const ts = new Date(msg.created_at);
    if (msg.direction === "incoming" && !entry.firstInbound) entry.firstInbound = ts;
    if (msg.direction === "outgoing" && !entry.firstOutbound) entry.firstOutbound = ts;
  }

  const responseTimes: number[] = [];
  for (const [, entry] of convMsgMap) {
    if (entry.firstInbound && entry.firstOutbound && entry.firstOutbound > entry.firstInbound) {
      const diff = (entry.firstOutbound.getTime() - entry.firstInbound.getTime()) / 60000;
      if (diff < 1440) responseTimes.push(diff);
    }
  }
  responseTimes.sort((a, b) => a - b);

  const avgFirstResponse = responseTimes.length > 0 ? Math.round(responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length) : 0;

  // Resolution time
  const resolutionTimes: number[] = [];
  for (const conv of conversations || []) {
    if (conv.status === "closed" && conv.closed_at) {
      const diff = (new Date(conv.closed_at).getTime() - new Date(conv.created_at).getTime()) / 60000;
      if (diff < 10080) resolutionTimes.push(diff);
    }
  }
  resolutionTimes.sort((a, b) => a - b);
  const avgResolution = resolutionTimes.length > 0 ? Math.round(resolutionTimes.reduce((s, v) => s + v, 0) / resolutionTimes.length) : 0;

  // SLA breaches (default 30min first response)
  const slaBreaches = responseTimes.filter(t => t > 30).length;

  // By status
  const statusMap: Record<string, number> = {};
  for (const conv of conversations || []) {
    const label = conv.status === "closed" ? "Fechado" : conv.handoff_mode ? "Humano" : conv.status === "pending" ? "Pendente" : "Aberto";
    statusMap[label] = (statusMap[label] || 0) + 1;
  }

  // By day (last 7 days)
  const dayMap: Record<string, { opened: number; closed: number }> = {};
  for (let i = 6; i >= 0; i--) {
    dayMap[format(subDays(now, i), "yyyy-MM-dd")] = { opened: 0, closed: 0 };
  }
  for (const conv of conversations || []) {
    const openDay = format(new Date(conv.created_at), "yyyy-MM-dd");
    if (dayMap[openDay]) dayMap[openDay].opened++;
    if (conv.closed_at) {
      const closeDay = format(new Date(conv.closed_at), "yyyy-MM-dd");
      if (dayMap[closeDay]) dayMap[closeDay].closed++;
    }
  }

  // By hour (message volume)
  const hourMap: Record<number, number> = {};
  for (let h = 0; h < 24; h++) hourMap[h] = 0;
  for (const msg of messages || []) {
    if (msg.direction === "incoming") {
      const h = new Date(msg.created_at).getHours();
      hourMap[h]++;
    }
  }

  // By agent (with response time and closed count)
  const agentConvs: Record<string, { total: number; closed: number; responseTimes: number[] }> = {};
  for (const conv of conversations || []) {
    const agent = conv.assigned_to || "Não atribuído";
    if (!agentConvs[agent]) agentConvs[agent] = { total: 0, closed: 0, responseTimes: [] };
    agentConvs[agent].total++;
    if (conv.status === "closed") agentConvs[agent].closed++;
  }
  // Map response times to agents
  for (const conv of conversations || []) {
    if (!conv.assigned_to) continue;
    const entry = convMsgMap.get(conv.id);
    if (entry?.firstInbound && entry?.firstOutbound && entry.firstOutbound > entry.firstInbound) {
      const diff = (entry.firstOutbound.getTime() - entry.firstInbound.getTime()) / 60000;
      if (diff < 1440 && agentConvs[conv.assigned_to]) {
        agentConvs[conv.assigned_to].responseTimes.push(diff);
      }
    }
  }

  return {
    avgFirstResponseMin: avgFirstResponse,
    avgResolutionMin: avgResolution,
    p50FirstResponseMin: percentile(responseTimes, 50),
    p90FirstResponseMin: percentile(responseTimes, 90),
    openConversations: openCount || 0,
    closedThisMonth: closedMonth || 0,
    closedLast30d: closedLast30 || 0,
    slaBreaches,
    csatAvg: (() => { const s = (conversations || []).filter(c => c.csat_score !== null); return s.length > 0 ? Math.round(s.reduce((a, c) => a + (c.csat_score ?? 0), 0) / s.length * 10) / 10 : 0; })(),
    csatCount: (conversations || []).filter(c => c.csat_score !== null).length,
    byStatus: Object.entries(statusMap).map(([name, value]) => ({ name, value })),
    byDay: Object.entries(dayMap).map(([date, v]) => ({ date, ...v })),
    byHour: Object.entries(hourMap).map(([hour, count]) => ({ hour: Number(hour), count })),
    byAgent: Object.entries(agentConvs)
      .map(([name, d]) => ({
        name: name.substring(0, 20),
        conversations: d.total,
        closedCount: d.closed,
        avgResponseMin: d.responseTimes.length > 0 ? Math.round(d.responseTimes.reduce((s, v) => s + v, 0) / d.responseTimes.length) : 0,
      }))
      .sort((a, b) => b.conversations - a.conversations)
      .slice(0, 8),
  };
}

export function useAttendanceStats() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ["attendance-stats", tenantId],
    queryFn: () => fetchAttendanceStats(tenantId!),
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
  });
}
