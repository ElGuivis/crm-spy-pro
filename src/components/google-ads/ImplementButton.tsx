import { useState } from "react";
import { Wand2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Implementer } from "@/hooks/useGoogleAdsImplement";
import type { Suggestion } from "@/lib/googleAdsImplement";

export const REVIEW_ANCHOR = "propostas-dados";

interface Props {
  impl: Implementer;
  recs: Suggestion[];
  /** Texto do botao (padrao: "Implementar"). */
  label?: string;
  /** Quando nao ha proposta: explica por que o sistema nao faz sozinho (ou o que e acao do usuario). */
  manual?: string;
  /** Acao propria (ex.: atualizar dados) no lugar de propostas. */
  run?: { label: string; pending: boolean; onRun: () => void };
  size?: "sm" | "default";
}

/** O botao unico de "Implementar": confirma o que sera feito, aplica no Google Ads, confere e permite desfazer pela aba Atividade. */
export function ImplementButton({ impl, recs, label = "Implementar", manual, run, size = "sm" }: Props) {
  const [confirm, setConfirm] = useState(false);

  if (run) {
    return <Button size={size} variant="secondary" disabled={run.pending} onClick={run.onRun}><Wand2 className="mr-1 h-4 w-4" />{run.pending ? "Atualizando…" : run.label}</Button>;
  }
  if (!recs.length) return manual ? <p className="text-xs text-muted-foreground">{manual}</p> : null;

  // Reconstrucao que ainda precisa do texto do anuncio novo: leva para a revisao em vez de aplicar as cegas.
  const needsReview = recs.some((r) => r.kind === "rebuild_search_structure" && r.payload.needs_copy && !r.payload.new_ad);
  if (needsReview) {
    return (
      <Button size={size} variant="secondary" onClick={() => document.getElementById(REVIEW_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <Wand2 className="mr-1 h-4 w-4" /> Revisar e implementar
      </Button>
    );
  }

  const pending = impl.implement.isPending;
  return (
    <>
      <Button size={size} disabled={!impl.canApply || pending} onClick={() => setConfirm(true)} title={impl.blockedReason ?? undefined}>
        <Wand2 className="mr-1 h-4 w-4" />{pending ? "Implementando…" : label}
      </Button>
      {!impl.canApply && impl.blockedReason && <span className="ml-2 text-xs text-muted-foreground">{impl.blockedReason}</span>}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Implementar no Google Ads?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Estas mudanças serão feitas de verdade na conta (pausas e reduções primeiro). O servidor confere cada uma depois, e tudo fica na aba Atividade, com desfazer.</p>
                <ul className="list-disc space-y-1 pl-5 text-foreground">{recs.map((r) => <li key={r.id}>{r.title}</li>)}</ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => impl.implement.mutate(recs.map((r) => r.id))}>Implementar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
