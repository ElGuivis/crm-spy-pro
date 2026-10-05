import { Loader2, Newspaper } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useMarketingSettings, useNewsletterStats } from "@/hooks/useLiMarketing";

const n = (v: number) => v.toLocaleString("pt-BR");

/** Newsletter da loja: números, sincronização e a regra de que só os novos inscritos recebem algo. */
export function NewsletterPanel() {
  const { data: s, isLoading } = useNewsletterStats();
  const { settings, save } = useMarketingSettings();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Newspaper className="h-4 w-4" />Newsletter da Loja Integrada</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {isLoading || !s ? <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{n(s.total)}</p><p className="text-xs text-muted-foreground">inscritos na loja</p></div>
                <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{n(s.baseline)}</p><p className="text-xs text-muted-foreground">histórico (só povoado, não recebe envios)</p></div>
                <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{n(s.fresh)}</p><p className="text-xs text-muted-foreground">novos desde a conexão (recebem a série de boas-vindas)</p></div>
                <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{n(s.leads)}</p><p className="text-xs text-muted-foreground">ainda não são clientes ({n(s.customers)} já compraram)</p></div>
              </div>
              <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                {!s.baselineDone ? <Badge variant="secondary">Primeira sincronização em andamento</Badge> : s.scanning ? <Badge variant="secondary">Atualizando</Badge> : <Badge variant="outline">Sincronizado</Badge>}
                {s.lastScanAt ? `Última varredura completa: ${new Date(s.lastScanAt).toLocaleString("pt-BR")}. ` : ""}
                A loja só lista por e-mail, então novos inscritos são detectados por varredura (até algumas dezenas de minutos de atraso). Quem saiu da newsletter da loja entra na nossa lista de supressão{s.removed ? ` (${n(s.removed)} até agora)` : ""}.
              </p>
            </>
          )}
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <p className="font-medium">Como usar os novos inscritos</p>
            <p className="text-muted-foreground">Ligue o fluxo "Boas-vindas" (aba ao lado) para a série automática, ou escolha a audiência "Novos inscritos da newsletter" ao criar uma campanha. Os inscritos antigos nunca entram em nenhum envio.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Descadastro em duas vias</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Quem sair aqui também sai da loja</p>
              <p className="text-xs text-muted-foreground">
                Descadastro pelo link, reclamação ou e-mail inválido: a pessoa é removida da newsletter e das automações de recuperação da Loja Integrada, para a loja não continuar escrevendo para quem pediu para parar.
                {s && (s.outboxPending > 0 || s.outboxFailed > 0) ? ` Fila: ${s.outboxPending} pendente(s), ${s.outboxFailed} com falha.` : ""}
              </p>
            </div>
            <Switch checked={settings.sync_unsubscribes} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ sync_unsubscribes: v })} aria-label="Sincronizar descadastros com a loja" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
