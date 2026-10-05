import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useContactPolicy, useTouchSummary } from "@/hooks/useContactPolicy";

const PURPOSE: Record<string, string> = {
  campaign: "Campanhas de e-mail", bulk: "Disparo em massa (WhatsApp)", recovery: "Recuperação de abandono", welcome: "Boas-vindas",
  cashback: "Cashback (entrega do cupom)", cashback_reminder: "Lembrete de cashback", birthday: "Aniversário", reactivation: "Reativação",
};
const CAPS = [1, 2, 3, 4, 5, 8, 10];
const GAPS = [0, 6, 12, 24, 48, 72];

/** Regras de contato: valem para todos os módulos que enviam e-mail ou WhatsApp, e o resumo de tudo que foi enviado. */
export function ContactPolicyPanel() {
  const { policy, isLoading, save } = useContactPolicy();
  const [days, setDays] = useState(7);
  const { data: summary } = useTouchSummary(days);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Regras de contato (valem para todos os módulos)</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Campanhas, recuperação, boas-vindas, cashback, aniversário, reativação e disparos de WhatsApp consultam as mesmas regras antes de enviar, e cada envio fica registrado,
            para ninguém ser atingido por vários módulos ao mesmo tempo. E-mail na lista de supressão e telefone bloqueado nunca recebem, com a regra ligada ou não.
          </p>
          {isLoading ? <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : (
            <>
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Limitar a frequência por pessoa</p>
                  <p className="text-xs text-muted-foreground">Desligado, só a supressão e o bloqueio continuam valendo.</p>
                </div>
                <Switch checked={policy.enabled} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ enabled: v })} aria-label="Limitar a frequência por pessoa" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">No máximo de mensagens por pessoa em 24 horas (todos os canais)</p>
                  <Select value={String(policy.daily_cap)} disabled={!policy.enabled || save.isPending} onValueChange={(v) => save.mutate({ daily_cap: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CAPS.map((n) => <SelectItem key={n} value={String(n)}>{n} mensagem{n > 1 ? "ns" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Não vale para cashback, lembrete de cashback e aniversário. Envio adiado pelo limite sai quando a pessoa voltar a ficar abaixo dele.</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium">Disparo em massa cede a quem recebeu mensagem automática há menos de</p>
                  <Select value={String(policy.broadcast_gap_hours)} disabled={!policy.enabled || save.isPending} onValueChange={(v) => save.mutate({ broadcast_gap_hours: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{GAPS.map((h) => <SelectItem key={h} value={String(h)}>{h === 0 ? "Desligado" : `${h} horas`}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Prioridade: recuperação, boas-vindas, lembretes e reativação passam na frente de campanhas e disparos em massa.</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">O que foi enviado</CardTitle>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 7, 30].map((d) => <SelectItem key={d} value={String(d)}>{d === 1 ? "Últimas 24 h" : `Últimos ${d} dias`}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!summary?.length ? <p className="text-sm text-muted-foreground">Nenhum envio registrado no período.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Finalidade</TableHead><TableHead>Canal</TableHead><TableHead className="text-right">Mensagens</TableHead><TableHead className="text-right">Pessoas</TableHead></TableRow></TableHeader>
              <TableBody>
                {summary.map((r) => (
                  <TableRow key={`${r.purpose}-${r.channel}`}>
                    <TableCell>{PURPOSE[r.purpose] ?? r.purpose}</TableCell><TableCell>{r.channel === "email" ? "E-mail" : "WhatsApp"}</TableCell>
                    <TableCell className="text-right">{r.touches}</TableCell><TableCell className="text-right">{r.people}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
