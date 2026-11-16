import type { TimelineSession } from "@/hooks/useConversationTimeline";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** Marca entre atendimentos no histórico unificado do número. */
export function SessionDivider({ session, kind }: { session: TimelineSession; kind: "start" | "end" }) {
  const label = kind === "end"
    ? `Atendimento encerrado · ${fmt(session.closed_at ?? session.created_at)}`
    : `${session.source === "automation" ? "Mensagem automática" : "Novo atendimento"} · ${fmt(session.created_at)}`;
  return (
    <div className="flex items-center gap-2 my-3 text-[11px] text-muted-foreground" role="separator" aria-label={label}>
      <div className="flex-1 h-px bg-border" />
      <span className="shrink-0 rounded-full border bg-muted/50 px-2 py-0.5">{label}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
