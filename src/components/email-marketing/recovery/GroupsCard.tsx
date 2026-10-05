import { useState } from "react";
import { AlertTriangle, Loader2, Undo2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAllRFMAudiences } from "@/hooks/useAllRFMAudiences";
import { useGroupActions, useGroupJobs, useLiGroups, type GroupPreview } from "@/hooks/useLiGroups";

/** Enviar os clientes de uma audiência RFM (ex.: campeões) para um grupo da loja. Sempre com prévia, confirmação e desfazer. */
export function GroupsCard() {
  const groups = useLiGroups();
  const { data: audiences } = useAllRFMAudiences();
  const { data: jobs } = useGroupJobs();
  const actions = useGroupActions();
  const [audienceId, setAudienceId] = useState("");
  const [group, setGroup] = useState("");
  const [preview, setPreview] = useState<GroupPreview | null>(null);

  const reset = () => setPreview(null);
  const doPreview = async () => { setPreview(await actions.preview.mutateAsync({ audienceId, group })); };
  const running = (jobs ?? []).some((j) => j.status === "running");

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Grupos de clientes da loja</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Leve um segmento RFM (ex.: campeões) para um grupo da loja, como "VIP". Atenção: grupos podem ter regras de preço na loja (atacado, desconto).
          Confira o que cada grupo faz no painel da Loja Integrada antes de mover alguém. Cada mudança pode ser desfeita.
        </p>
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Os grupos são criados no painel da Loja Integrada (a API só permite escolher entre os que já existem). Grupos na sua loja: {groups.isLoading ? "carregando..." : (groups.data ?? []).map((g) => g.nome).join(", ") || "nenhum"}.
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Audiência RFM</p>
            <Select value={audienceId} onValueChange={(v) => { setAudienceId(v); reset(); }}>
              <SelectTrigger><SelectValue placeholder={audiences?.length ? "Escolha a audiência" : "Nenhuma audiência RFM criada"} /></SelectTrigger>
              <SelectContent>{(audiences ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.member_count})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Mover para o grupo</p>
            <Select value={group} onValueChange={(v) => { setGroup(v); reset(); }}>
              <SelectTrigger><SelectValue placeholder="Escolha o grupo" /></SelectTrigger>
              <SelectContent>{(groups.data ?? []).map((g) => <SelectItem key={g.id} value={g.nome}>{g.nome}{g.padrao ? " (padrão)" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <Button variant="outline" disabled={!audienceId || !group || actions.preview.isPending} onClick={doPreview} className="gap-2">
          {actions.preview.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Ver quantos serão movidos
        </Button>

        {preview && (
          <div className="rounded-lg border p-3 text-sm space-y-2">
            <p><strong>{preview.toMove}</strong> cliente(s) serão movidos para "{group}" ({preview.members} da audiência estão na loja; {preview.alreadyInGroup} já estão nesse grupo).</p>
            {Object.keys(preview.from).length > 0 && <p className="text-xs text-muted-foreground">Saem de: {Object.entries(preview.from).map(([g, n]) => `${g} (${n})`).join(", ")}.</p>}
            <p className="text-xs text-muted-foreground">Acontece em segundo plano, cerca de 45 clientes por minuto (limite da loja).</p>
            <ConfirmMove disabled={running || preview.toMove === 0} count={preview.toMove} group={group} onConfirm={async () => { await actions.start.mutateAsync({ audienceId, group }); reset(); }} />
            {running && <p className="text-xs text-amber-700">Já há uma alteração em andamento; espere terminar.</p>}
          </div>
        )}

        {(jobs ?? []).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Alterações recentes</p>
            {(jobs ?? []).slice(0, 5).map((j) => (
              <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-medium">{j.label}
                    {j.status === "running" ? <Badge variant="secondary">Em andamento</Badge> : j.status === "cancelled" ? <Badge variant="outline">Cancelado</Badge> : <Badge>Concluído</Badge>}
                    {j.undone_at && <Badge variant="outline">Desfeito</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{j.done}/{j.total} movidos{j.failed ? ` · ${j.failed} com erro` : ""} · {new Date(j.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div className="flex gap-2">
                  {j.status === "running" && <Button size="sm" variant="outline" disabled={actions.cancel.isPending} onClick={() => actions.cancel.mutate(j.id)}>Cancelar</Button>}
                  {j.status !== "running" && !j.undone_at && !j.undo_of && j.done > 0 && (
                    <Button size="sm" variant="outline" className="gap-1" disabled={actions.undo.isPending || running} onClick={() => actions.undo.mutate(j.id)}><Undo2 className="h-3.5 w-3.5" />Desfazer</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Botão com confirmação explícita antes de mexer nos clientes da loja. */
function ConfirmMove({ disabled, count, group, onConfirm }: { disabled: boolean; count: number; group: string; onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button disabled={disabled} onClick={() => setOpen(true)}>Mover {count} cliente(s)</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover {count} cliente(s) para "{group}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto altera o grupo desses clientes na sua Loja Integrada. Se o grupo tiver regras de preço ou frete, elas passam a valer para eles. O grupo anterior de cada um fica guardado e você pode desfazer depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onConfirm(); }}>Confirmar e mover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
