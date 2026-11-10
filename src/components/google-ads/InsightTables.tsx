import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LIMIT_LABEL, money, pct, type InsightsReport } from "@/lib/googleAdsInsights";
import { fmtRoas } from "@/lib/googleAdsStrategy";

function Mini({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</CardHeader>
      <CardContent className="overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

const Empty = () => <p className="text-sm text-muted-foreground">Sem dados suficientes.</p>;

/** Tabelas de apoio das descobertas: onde o alcance é limitado, quando e onde rende mais, o que vende e o que só gasta. */
export function InsightTables({ r }: { r: InsightsReport }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Mini title="Alcance nas buscas" hint="Parcela das impressões possíveis que você perdeu, por orçamento ou por posição (média dos últimos 6 meses ativos).">
        {r.impression_share.length === 0 ? <Empty /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Campanha</TableHead><TableHead className="text-right">Alcance</TableHead><TableHead className="text-right">Perde p/ orçamento</TableHead><TableHead className="text-right">Perde p/ ranking</TableHead><TableHead>Limite</TableHead></TableRow></TableHeader>
            <TableBody>
              {r.impression_share.map((i) => (
                <TableRow key={i.campaign}>
                  <TableCell className="max-w-[200px] truncate" title={i.campaign}>{i.campaign}</TableCell>
                  <TableCell className="text-right">{pct(i.share)}</TableCell><TableCell className="text-right">{pct(i.lost_budget)}</TableCell>
                  <TableCell className="text-right">{pct(i.lost_rank)}</TableCell>
                  <TableCell><Badge variant={i.limit === "none" ? "outline" : "secondary"}>{LIMIT_LABEL[i.limit]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Mini>

      <Mini title="Dispositivo, dia e hora" hint="ROAS = receita ÷ gasto. Só segmentos com gasto relevante.">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">{r.devices.length ? r.devices.map((d) => <span key={d.device} className="rounded-md bg-muted px-2 py-1">{d.device}: <strong>{fmtRoas(d.roas)}</strong> ({money(d.cost)})</span>) : <Empty />}</div>
          <div className="flex flex-wrap gap-2">{r.weekdays.map((d) => <span key={d.day} className="rounded-md bg-muted px-2 py-1">{d.day}: <strong>{fmtRoas(d.roas)}</strong></span>)}</div>
          {r.hours.best.length > 0 && (
            <div>
              <div>Melhores horas: {r.hours.best.map((h) => `${h.hour}h (${fmtRoas(h.roas)})`).join(", ")}</div>
              <div>Piores horas: {r.hours.worst.map((h) => `${h.hour}h (${fmtRoas(h.roas)})`).join(", ")}</div>
            </div>
          )}
        </div>
      </Mini>

      <Mini title="Regiões que mais gastaram">
        {r.regions.length === 0 ? <Empty /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Região</TableHead><TableHead className="text-right">Gasto</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader>
            <TableBody>{r.regions.map((g) => <TableRow key={g.region}><TableCell>{g.region}</TableCell><TableCell className="text-right">{money(g.cost)}</TableCell><TableCell className="text-right">{fmtRoas(g.roas)}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </Mini>

      <Mini title="Produtos no Shopping">
        <div className="space-y-3 text-sm">
          <div>
            <div className="mb-1 font-medium">Mais venderam</div>
            {r.products.top.length === 0 ? <Empty /> : <ul className="space-y-1">{r.products.top.map((p) => <li key={p.title} className="flex justify-between gap-2"><span className="truncate" title={p.title}>{p.title}</span><span className="whitespace-nowrap">{money(p.revenue)} · gasto {money(p.cost)}</span></li>)}</ul>}
          </div>
          <div>
            <div className="mb-1 font-medium">Só gastaram (nenhuma venda)</div>
            {r.products.waste.length === 0 ? <p className="text-muted-foreground">Nenhum.</p> : <ul className="space-y-1">{r.products.waste.map((p) => <li key={p.title} className="flex justify-between gap-2"><span className="truncate" title={p.title}>{p.title}</span><span className="whitespace-nowrap">{money(p.cost)}</span></li>)}</ul>}
          </div>
        </div>
      </Mini>

      <Mini title="Palavras-chave e anúncios">
        <div className="space-y-2 text-sm">
          <div>Anúncios ligados: <strong>{r.ads.total}</strong> · força fraca/média: <strong>{r.ads.weak}</strong> · reprovados: <strong>{r.ads.not_approved}</strong></div>
          <div>Palavras com gasto e sem conversão: {r.keywords.waste.length ? r.keywords.waste.map((k) => `${k.text} (${money(k.cost)})`).join("; ") : "nenhuma"}</div>
          <div>Nota de qualidade baixa: {r.keywords.low_quality.length ? r.keywords.low_quality.map((k) => `${k.text} (${k.score})`).join("; ") : "nenhuma (ou o Google não informou a nota)"}</div>
          {r.not_serving.length > 0 && <div className="text-destructive">Ligadas e sem veicular: {r.not_serving.map((n) => `${n.campaign} — ${n.reasons.join("; ")}`).join(" | ")}</div>}
        </div>
      </Mini>

      <Mini title="Termos candidatos a negativar" hint="Gastaram e nunca converteram. Revise: termo da marca sem venda pode só precisar de página melhor.">
        {r.waste.top.length === 0 ? <Empty /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Termo</TableHead><TableHead className="text-right">Gasto</TableHead><TableHead className="text-right">Cliques</TableHead></TableRow></TableHeader>
            <TableBody>{r.waste.top.map((t) => <TableRow key={t.term}><TableCell>{t.term}</TableCell><TableCell className="text-right">{money(t.cost)}</TableCell><TableCell className="text-right">{t.clicks}</TableCell></TableRow>)}</TableBody>
          </Table>
        )}
      </Mini>
    </div>
  );
}
