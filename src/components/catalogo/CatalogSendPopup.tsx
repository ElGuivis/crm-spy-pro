import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, Minus, Maximize2, Square, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { CatalogSendState } from "@/contexts/CatalogSendContext";

interface Props {
  state: CatalogSendState | null;
  onStop: () => void;
  onRetry: () => void;
  onClose: () => void;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Progresso do envio do catálogo: fica por cima de qualquer tela, pode ser minimizado e tem botão para interromper. */
export function CatalogSendPopup({ state, onStop, onRetry, onClose }: Props) {
  const [minimized, setMinimized] = useState(false);
  const idle = !state;
  useEffect(() => { if (idle) setMinimized(false); }, [idle]);
  if (!state) return null;
  const running = state.phase === "running";
  const failed = state.result?.failed ?? 0;
  const ok = !running && !failed && !state.error;
  const pct = state.total ? Math.round((state.sent / state.total) * 100) : 0;
  const title = running
    ? (state.stopping ? "Interrompendo..." : "Enviando...")
    : ok ? "Catálogo enviado" : state.result?.stopped ? "Envio interrompido" : "Catálogo enviado em parte";
  const Icon = running ? Loader2 : ok ? CheckCircle2 : AlertTriangle;
  const iconCls = running ? "animate-spin text-primary" : ok ? "text-green-600" : "text-destructive";

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm shadow-lg max-md:bottom-20"
        aria-label="Abrir o progresso do envio"
      >
        <Icon className={`h-4 w-4 ${iconCls}`} />
        <span>{running ? `${state.sent}/${state.total} produtos` : title}</span>
        <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[100] w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-card p-4 shadow-xl max-md:bottom-20">
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconCls}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">Catálogo para {state.label}</p>
        </div>
        {running
          ? <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMinimized(true)} aria-label="Minimizar"><Minus className="h-4 w-4" /></Button>
          : <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></Button>}
      </div>

      <div className="mt-3 space-y-1.5">
        <Progress value={pct} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {plural(state.sent, "produto")} de {state.total} enviado{state.sent === 1 ? "" : "s"}
          {!running && failed > 0 && <> · <span className="text-destructive">{failed} {failed > 1 ? "não saíram" : "não saiu"}</span></>}
        </p>
        {state.error && <p className="text-xs text-destructive">{state.error}</p>}
        {running && <p className="text-xs text-muted-foreground">Pode navegar pelo sistema, mas não feche esta aba até terminar.</p>}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        {running && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onStop} disabled={state.stopping}>
            <Square className="h-3.5 w-3.5" />
            {state.stopping ? "Terminando o produto atual..." : "Interromper"}
          </Button>
        )}
        {!running && failed > 0 && (
          <Button size="sm" className="gap-1.5" onClick={onRetry}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reenviar {failed}
          </Button>
        )}
      </div>
    </div>
  );
}
