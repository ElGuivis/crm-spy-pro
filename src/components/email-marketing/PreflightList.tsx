import { AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import type { PreflightIssue } from "@/lib/email-preflight";

/** Resultado da verificação antes do envio: erros bloqueiam, avisos só alertam. */
export function PreflightList({ issues, loading }: { issues: PreflightIssue[]; loading: boolean }) {
  if (loading) return null;
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <CheckCircle2 className="h-4 w-4 text-primary" /> Verificação antes do envio: tudo certo.
      </div>
    );
  }
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs space-y-1">
          <p className="font-semibold text-destructive flex items-center gap-1.5"><XCircle className="h-4 w-4" />Corrija antes de enviar</p>
          <ul className="list-disc pl-5 space-y-0.5">{errors.map((i) => <li key={i.code}>{i.text}</li>)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs space-y-1">
          <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />Atenção (dá para enviar assim)</p>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-800 dark:text-amber-300">{warnings.map((i) => <li key={i.code}>{i.text}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
