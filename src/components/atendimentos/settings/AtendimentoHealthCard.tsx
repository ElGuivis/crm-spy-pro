import { Activity, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAtendimentoHealth, type AtendimentoHealth } from "@/hooks/useAtendimentoHealth";

interface Check { label: string; value: number | boolean; bad: boolean; hint: string }

function checksFor(h: AtendimentoHealth): Check[] {
  return [
    { label: "Clientes esperando atendente", value: h.pending_handoff, bad: h.oldest_handoff_minutes > 5, hint: h.pending_handoff ? `o mais antigo espera ${h.oldest_handoff_minutes} min` : "ninguém esperando" },
    { label: "Mensagens paradas na fila", value: h.stuck_in_queue + h.queued_over_5min, bad: h.stuck_in_queue + h.queued_over_5min > 0, hint: "deveria ser sempre 0" },
    { label: "Falhas de envio (24 h)", value: h.failed_messages_24h, bad: h.failed_messages_24h > 0, hint: "número sem WhatsApp ou erro do provedor" },
    { label: "Possíveis mensagens duplicadas (24 h)", value: h.duplicate_suspects_24h, bad: h.duplicate_suspects_24h > 0, hint: "mesmo texto em menos de 60 s" },
    { label: "Envio do WhatsApp bloqueado", value: h.circuit_open, bad: h.circuit_open, hint: "o disjuntor abre após falhas seguidas do provedor" },
  ];
}

export function AtendimentoHealthCard() {
  const { data, isLoading } = useAtendimentoHealth();
  const checks = data ? checksFor(data) : [];
  const problems = checks.filter((c) => c.bad).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Saúde do atendimento
          {data && <Badge variant={problems ? "destructive" : "default"}>{problems ? `${problems} alerta(s)` : "tudo certo"}</Badge>}
        </CardTitle>
        <CardDescription>Sinais que o cliente não vê. Atualiza sozinho a cada minuto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Verificando...</p>}
        {checks.map((c) => (
          <div key={c.label} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{c.label}</p>
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold text-foreground">{typeof c.value === "boolean" ? (c.value ? "Sim" : "Não") : c.value}</span>
              {c.bad ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
