import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNativeStatus, useToggleNative } from "@/hooks/useRecoveryData";
import { useRecoveryEnv } from "@/hooks/useRecoveryEnv";
import { useRecoveryFlows } from "@/hooks/useRecoveryFlows";
import { NATIVE_KINDS, RECOVERY_KINDS, delayLabel, type RecoveryKind } from "@/lib/recovery";

const KEY_LABEL: Record<string, string> = { "abandoned-cart": "Carrinho", "abandoned-product": "Navegação", "cancelled-order": "Pedido" };

/** Endereço da loja, automações nativas da Loja Integrada (ligar/desligar) e estado dos webhooks. */
export function NativePanel() {
  const { data, isLoading, error, refetch } = useNativeStatus();
  const toggle = useToggleNative();
  const env = useRecoveryEnv();
  const { flows } = useRecoveryFlows();
  const [storeUrl, setStoreUrl] = useState("");
  const [ack, setAck] = useState<{ kind: RecoveryKind; reason: string } | null>(null);
  const [pending, setPending] = useState<RecoveryKind | null>(null);

  const change = async (kind: RecoveryKind, enabled: boolean, acknowledge = false) => {
    setPending(kind);
    try {
      await toggle.mutateAsync({ kind, enabled, acknowledge });
      toast.success(enabled ? "Automação nativa ligada" : "Automação nativa desligada");
    } catch (e) {
      const err = e as Error & { needsAck?: boolean };
      if (err.needsAck) setAck({ kind, reason: err.message });
    }
    setPending(null);
  };

  const saveUrl = async () => {
    const ok = await env.saveStoreUrl(storeUrl);
    if (ok) { toast.success("Endereço da loja salvo"); setStoreUrl(""); } else toast.error("Endereço inválido. Exemplo: https://www.sualoja.com.br");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" />Endereço da loja</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">Usado para montar os links dos e-mails e do WhatsApp (carrinho e produtos). {env.storeUrl ? <>Atual: <strong>{env.storeUrl}</strong></> : <span className="text-destructive">Ainda não informado.</span>}</p>
          <div className="flex gap-2 max-w-xl">
            <Input placeholder="https://www.sualoja.com.br" value={storeUrl} onChange={(e) => setStoreUrl(e.target.value)} />
            <Button onClick={saveUrl} disabled={!storeUrl.trim()}>Salvar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Automações nativas da Loja Integrada</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A loja já tem automações próprias de recuperação (e-mail e WhatsApp). Você decide: manter a nativa, usar só o nosso fluxo ou as duas
            (com a opção "tirar da nativa quem atendermos", em cada fluxo, ninguém recebe em dobro). O estado abaixo é lido direto da loja.
          </p>
          {isLoading ? <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : error || !data ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-center justify-between gap-3">
              <span>{(error as Error | null)?.message ?? "Não consegui ler a Loja Integrada."}</span><Button size="sm" variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {NATIVE_KINDS.map((k) => {
                const n = data.native.find((x) => x.kind === k.kind);
                const ours = flows[k.kind].enabled;
                return (
                  <div key={k.kind} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{n?.title ?? k.nativeName}</span>
                        {n?.on ? <Badge>Nativa ligada</Badge> : <Badge variant="secondary">Nativa desligada</Badge>}
                        {ours ? <Badge variant="outline" className="border-emerald-300 text-emerald-700">Nosso fluxo ligado</Badge> : <Badge variant="outline">Nosso fluxo desligado</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {n?.on && n.delays.length ? `Envia em: ${n.delays.map(delayLabel).join(", ")} depois do abandono.` : n?.on ? "Sem regras de tempo ativas." : "Não está enviando nada."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {pending === k.kind && <Loader2 className="h-4 w-4 animate-spin" />}
                      <span className="text-xs text-muted-foreground">{n?.on ? "Ligada" : "Desligada"}</span>
                      <Switch checked={!!n?.on} disabled={pending !== null} onCheckedChange={(v) => change(k.kind, v)} aria-label={`Automação nativa: ${k.nativeName}`} />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                {data.subjectLlm ? "Assuntos gerados por IA: ligado na loja. " : ""}{data.nativeWhatsApp ? "A nativa também envia WhatsApp com o texto configurado na loja. " : ""}
                Desligar não apaga as regras da loja: é só ligar de novo para voltar ao que era.
              </p>
              {data.history.length > 0 && (
                <div className="text-xs text-muted-foreground pt-1">
                  Últimas alterações feitas aqui: {data.history.slice(0, 4).map((h) => `${KEY_LABEL[h.toggle_key] ?? h.toggle_key} ${h.to_state ? "ligada" : "desligada"} em ${new Date(h.created_at).toLocaleString("pt-BR")}`).join(" · ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Atualização em tempo real (webhooks)</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {data?.webhooks.registered ? (
            <p className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" />Webhooks registrados: pedidos e produtos chegam na hora.</p>
          ) : (
            <p className="flex items-start gap-2 text-amber-800"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{data?.webhooks.error ?? "Os webhooks ainda não foram registrados."} Sem eles, tudo funciona com atraso de poucos minutos (pedidos e abandonos são buscados a cada 5 a 10 minutos).</span>
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!ack} onOpenChange={(o) => { if (!o) setAck(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar a automação nativa mesmo assim?</AlertDialogTitle>
            <AlertDialogDescription>{ack?.reason} Ligue e configure o nosso fluxo antes, ou confirme só se quiser parar a recuperação deste tipo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter ligada</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const a = ack; setAck(null); if (a) change(a.kind, false, true); }}>Desligar a nativa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
