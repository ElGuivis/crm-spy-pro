import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { useCampaignProgress } from "@/hooks/useCampaignProgress";

interface Props {
  campaignId: string;
  status?: string;
  errorMessage?: string | null;
}

/** Barra de andamento do envio. Só aparece quando a campanha tem fila (envios feitos pelo sistema novo). */
export function SendProgressBanner({ campaignId, status, errorMessage }: Props) {
  const sending = status === "sending";
  const { data: p } = useCampaignProgress(campaignId, sending);
  if (!p) return null;

  const done = p.sent + p.failed;
  const pct = Math.round((done / p.total) * 100);
  const waiting = p.pending + p.sending;

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        {sending ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
          : waiting > 0 ? <AlertTriangle className="h-4 w-4 text-amber-500" />
          : <CheckCircle2 className="h-4 w-4 text-primary" />}
        {sending ? "Enviando…" : waiting > 0 ? `Envio interrompido (${status === "paused" ? "pausada" : "erro"})` : "Envio concluído"}
        <span className="ml-auto text-muted-foreground font-normal">{done} de {p.total} ({pct}%)</span>
      </div>
      <Progress value={pct} />
      <p className="text-xs text-muted-foreground">
        {p.sent} enviados{p.failed > 0 ? ` · ${p.failed} com falha (veja a aba Logs)` : ""}{waiting > 0 ? ` · ${waiting} na fila` : ""}
        {sending ? ". Pode fechar esta tela: o envio continua sozinho." : ""}
      </p>
      {!sending && waiting > 0 && (
        <p className="text-xs text-muted-foreground">
          {errorMessage ? `${errorMessage} ` : ""}Use "Enviar" na lista de campanhas para retomar de onde parou.
        </p>
      )}
    </div>
  );
}
