import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWhatsAppHealthAlerts } from "@/hooks/useWhatsAppHealthAlerts";

/** Aviso no topo (ou flutuante, nas telas cheias como Atendimentos) enquanto algum número de WhatsApp estiver com problema (desconectado, caindo, surdo...). */
export function WhatsAppHealthBanner({ floating = false }: { floating?: boolean }) {
  const { data: alerts } = useWhatsAppHealthAlerts();
  if (!alerts?.length) return null;

  return (
    <div
      role="alert"
      className={floating
        ? "fixed bottom-4 right-4 z-50 max-w-md rounded-md border border-destructive/40 bg-background px-4 py-2 shadow-lg"
        : "border-b border-destructive/40 bg-destructive/10 px-4 py-2 md:px-6"}
    >
      {alerts.map((a) => (
        <div key={a.id} className="flex items-start gap-2 py-1 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">WhatsApp {a.instance_name}:</span> {a.message}{" "}
            <span className="text-xs opacity-80">
              (desde {formatDistanceToNow(new Date(a.created_at), { locale: ptBR, addSuffix: false })})
            </span>
          </p>
          <Link to="/integrations" className="shrink-0 text-xs font-medium underline underline-offset-2">
            Ver integrações
          </Link>
        </div>
      ))}
    </div>
  );
}
