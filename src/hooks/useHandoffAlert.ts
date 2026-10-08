import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const BASE_TITLE_KEY = "__baseTitle";
const SLA_MS = 5 * 60 * 1000;

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch { /* navegador sem audio liberado: o aviso visual basta */ }
}

/**
 * Avisa quem atende quando um cliente pede atendente (conversa vira "pendente"): toast, bip e contador no
 * titulo da aba, em qualquer tela. Repete o aviso uma vez se ficar mais de 5 min sem ninguem assumir.
 */
export function useHandoffAlert() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const seen = useRef<Set<string> | null>(null);
  const warned = useRef<Set<string>>(new Set());

  const { data: pending = [] } = useQuery({
    queryKey: ["handoff-pending", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, last_message_at, contact:contacts(name, phone)")
        .eq("tenant_id", tenantId!)
        .eq("status", "pending")
        .is("closed_at", null)
        .is("assigned_to", null)
        .order("last_message_at", { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as Array<{ id: string; last_message_at: string | null; contact: { name: string | null; phone: string } | null }>;
    },
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`handoff-alert-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `tenant_id=eq.${tenantId}` },
        () => { queryClient.invalidateQueries({ queryKey: ["handoff-pending", tenantId] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, queryClient]);

  useEffect(() => {
    const ids = new Set(pending.map((c) => c.id));
    if (seen.current) {
      const fresh = pending.filter((c) => !seen.current!.has(c.id));
      for (const c of fresh) {
        toast.warning(`${c.contact?.name || c.contact?.phone || "Cliente"} pediu atendente`, { description: "Conversa aguardando atendimento humano.", duration: 15000 });
      }
      if (fresh.length) beep();
    }
    seen.current = ids;

    const now = Date.now();
    for (const c of pending) {
      const waited = now - new Date(c.last_message_at || now).getTime();
      if (waited > SLA_MS && !warned.current.has(c.id)) {
        warned.current.add(c.id);
        toast.error(`${c.contact?.name || c.contact?.phone || "Cliente"} espera há mais de 5 min`, { duration: 20000 });
      }
    }
  }, [pending]);

  useEffect(() => {
    const w = window as unknown as Record<string, string | undefined>;
    if (!w[BASE_TITLE_KEY]) w[BASE_TITLE_KEY] = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = pending.length ? `(${pending.length}) ${w[BASE_TITLE_KEY]}` : (w[BASE_TITLE_KEY] as string);
  }, [pending.length]);
}
