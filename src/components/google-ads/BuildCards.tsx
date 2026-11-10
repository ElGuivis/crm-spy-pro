import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImplementButton } from "@/components/google-ads/ImplementButton";
import type { GoogleAdsCampaign } from "@/hooks/useGoogleAds";
import type { Implementer } from "@/hooks/useGoogleAdsImplement";
import type { Suggestion } from "@/lib/googleAdsImplement";
import type { NegativeProposal, RebuildProposal, useGoogleAdsBuildActions } from "@/hooks/useGoogleAdsBuild";
import { brl } from "@/lib/googleAds";

type Actions = ReturnType<typeof useGoogleAdsBuildActions>;
interface Common { campaigns: GoogleAdsCampaign[]; canApply: boolean; blockedReason: string | null; actions: Actions }
const MATCH_LABEL = { EXACT: "exata", PHRASE: "frase", BROAD: "ampla" } as const;
const campName = (cs: GoogleAdsCampaign[], id: number) => cs.find((c) => c.campaign_id === id)?.name ?? String(id);
const lines = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);

/** Validação leve no navegador (o servidor valida de verdade): contagem e tamanho. */
function copyProblems(h: string[], d: string[], url: string): string[] {
  const e: string[] = [];
  if (h.length < 3) e.push("mínimo de 3 títulos");
  if (d.length < 2) e.push("mínimo de 2 descrições");
  if (h.some((x) => x.length > 30)) e.push("há título com mais de 30 caracteres");
  if (d.some((x) => x.length > 90)) e.push("há descrição com mais de 90 caracteres");
  if ([...h, ...d].some((x) => /\[[^\]]*\]/.test(x))) e.push("há trecho entre colchetes para completar");
  if (!/^https:\/\//i.test(url)) e.push("URL final precisa começar com https://");
  return e;
}

function NegativeCard({ p, c }: { p: NegativeProposal; c: Common }) {
  const [sel, setSel] = useState<Set<string>>(new Set(p.payload.terms));
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setSel(new Set(p.payload.terms)), [p.payload.terms.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = p.payload.terms.filter((t) => sel.has(t));
  const toggle = (t: string) => setSel((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{p.title}</CardTitle><p className="text-sm text-muted-foreground">{p.rationale}</p></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-1 sm:grid-cols-2">
          {p.payload.term_costs.map((t) => (
            <label key={t.text} className="flex items-center gap-2 text-sm"><Checkbox checked={sel.has(t.text)} onCheckedChange={() => toggle(t.text)} />{t.text}<span className="text-muted-foreground">({brl(t.cost * 1e6)})</span></label>
          ))}
        </div>
        {p.error && <p className="text-xs text-destructive">Falhou: {p.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!c.canApply || chosen.length === 0 || c.actions.apply.isPending} onClick={() => setConfirm(true)}>
            {c.actions.apply.isPending ? "Implementando…" : `Implementar: negativar ${chosen.length} termo(s)`}
          </Button>
          {c.blockedReason && <span className="text-sm text-muted-foreground">{c.blockedReason}</span>}
        </div>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Adicionar palavras negativas?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2"><p>Em <strong>{campName(c.campaigns, p.payload.campaign_id)}</strong>, estas buscas exatas deixam de acionar o anúncio. Dá para desfazer pela aba Atividade.</p>
                  <ul className="list-disc pl-5 text-foreground">{chosen.map((t) => <li key={t}>{t}</li>)}</ul></div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => c.actions.apply.mutate({ id: p.id, patch: { terms: chosen } })}>Aplicar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function RebuildCard({ p, c, aiOn }: { p: RebuildProposal; c: Common; aiOn: boolean }) {
  const pl = p.payload;
  const key = (k: { text: string; match_type: string }) => `${k.text}|${k.match_type}`;
  const [sel, setSel] = useState<Set<string>>(new Set(pl.keywords.map(key)));
  const [titles, setTitles] = useState((pl.new_ad?.headlines ?? []).join("\n"));
  const [descs, setDescs] = useState((pl.new_ad?.descriptions ?? []).join("\n"));
  const [url, setUrl] = useState(pl.new_ad?.final_url || pl.final_url || "");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setTitles((pl.new_ad?.headlines ?? []).join("\n")); setDescs((pl.new_ad?.descriptions ?? []).join("\n")); setUrl(pl.new_ad?.final_url || pl.final_url || ""); }, [JSON.stringify(pl.new_ad)]); // eslint-disable-line react-hooks/exhaustive-deps

  const kws = pl.keywords.filter((k) => sel.has(key(k)));
  const h = lines(titles), d = lines(descs);
  const wantsNewAd = pl.needs_copy || h.length > 0 || d.length > 0;
  const problems = wantsNewAd ? copyProblems(h, d, url) : [];
  const noAd = pl.enable_ad_ids.length === 0 && !wantsNewAd;
  const patch = () => ({ keywords: kws.map(({ text, match_type }) => ({ text, match_type })), new_ad: wantsNewAd ? { headlines: h, descriptions: d, final_url: url } : null });
  const toggle = (k: string) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const busy = c.actions.apply.isPending || c.actions.saveDraft.isPending || c.actions.generateCopy.isPending;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{p.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{p.rationale}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 text-sm font-medium">Palavras-chave ({kws.length} de {pl.keywords.length})</div>
          <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
            {pl.keywords.map((k) => (
              <label key={key(k)} className="flex items-center gap-2 text-sm">
                <Checkbox checked={sel.has(key(k))} onCheckedChange={() => toggle(key(k))} />
                <span className="truncate" title={k.text}>{k.text}</span><Badge variant="outline">{MATCH_LABEL[k.match_type]}</Badge>
                <span className="text-xs text-muted-foreground">{brl(k.value * 1e6)}</span>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">O valor ao lado é a receita que a palavra (ou o termo) já gerou nesta campanha.</p>
        </div>

        <div className="text-sm">{pl.enable_ad_ids.length > 0 ? `Anúncios pausados e aprovados que serão religados: ${pl.enable_ad_ids.length}.` : "Nenhum anúncio aproveitável: é preciso um anúncio novo."}</div>

        <div className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Anúncio novo {pl.needs_copy ? "(obrigatório)" : "(opcional)"} {pl.ai_generated && <Badge variant="secondary">rascunho da IA</Badge>}</div>
            <Button size="sm" variant="outline" disabled={!c.canApply || !aiOn || busy} onClick={() => c.actions.generateCopy.mutate(p.id)} title={aiOn ? "" : "Ligue a IA no card Consultor com IA"}>
              <Sparkles className="mr-1 h-4 w-4" /> {c.actions.generateCopy.isPending ? "Escrevendo…" : "Gerar texto com IA"}
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>Títulos (um por linha, até 30 caracteres)</Label><Textarea rows={6} value={titles} onChange={(e) => setTitles(e.target.value)} disabled={!c.canApply} /></div>
            <div className="space-y-1"><Label>Descrições (uma por linha, até 90 caracteres)</Label><Textarea rows={6} value={descs} onChange={(e) => setDescs(e.target.value)} disabled={!c.canApply} /></div>
          </div>
          <div className="space-y-1"><Label>Página de destino (URL final)</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={!c.canApply} /></div>
          {problems.length > 0 && <p className="text-xs text-destructive">Para aplicar: {problems.join("; ")}.</p>}
          <p className="text-xs text-muted-foreground">Confira o texto: a IA não conhece ofertas, preços nem prazos da loja, então nada disso foi incluído.</p>
        </div>

        {p.error && <p className="text-xs text-destructive">Falhou: {p.error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" disabled={!c.canApply || busy} onClick={() => c.actions.saveDraft.mutate({ id: p.id, patch: patch() })}>Salvar rascunho</Button>
          <Button disabled={!c.canApply || busy || problems.length > 0 || noAd || kws.length === 0} onClick={() => setConfirm(true)}>
            {c.actions.apply.isPending ? "Implementando no Google Ads…" : "Implementar no Google Ads"}
          </Button>
          {c.blockedReason && <span className="text-sm text-muted-foreground">{c.blockedReason}</span>}
        </div>

        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reconstruir a campanha no Google Ads?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>Em <strong>{campName(c.campaigns, pl.campaign_id)}</strong>, de uma só vez (se o Google recusar algo, nada fica pela metade):</p>
                  <ul className="list-disc pl-5 text-foreground">
                    <li>criar {kws.length} palavra(s)-chave</li>
                    {pl.enable_ad_ids.length > 0 && <li>religar {pl.enable_ad_ids.length} anúncio(s) pausado(s) e aprovado(s)</li>}
                    {wantsNewAd && <li>criar 1 anúncio novo ({h.length} títulos, {d.length} descrições)</li>}
                  </ul>
                  <p>O Google ainda analisa anúncios novos, e a campanha só gasta se estiver ligada. Dá para desfazer pela aba Atividade.</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => c.actions.apply.mutate({ id: p.id, patch: patch() })}>Aplicar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

interface Props extends Common { negatives: NegativeProposal[]; rebuilds: RebuildProposal[]; aiOn: boolean; goals: Suggestion[]; impl: Implementer }

/** Propostas de construção a partir dos dados: reconstruir campanhas boas que não veiculam e negativar termos sem retorno. */
export function BuildCards({ negatives, rebuilds, aiOn, goals, impl, ...c }: Props) {
  if (!negatives.length && !rebuilds.length && !goals.length) return null;
  return (
    <div id="propostas-dados" className="scroll-mt-20 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Propostas a partir dos dados</h3>
        <p className="text-sm text-muted-foreground">Nada é enviado ao Google sem o seu clique. Cada aplicação é conferida depois e pode ser desfeita.</p>
      </div>
      {goals.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Metas de conversão: o que o Google está otimizando</CardTitle>
            <p className="text-sm text-muted-foreground">Estas metas não são venda, mas estão guiando os lances. Desligar não apaga dados: só tira o peso delas na otimização.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              {goals.map((g) => <li key={g.id}><strong>{g.title}</strong><div className="text-muted-foreground">{g.rationale}</div></li>)}
            </ul>
            <ImplementButton impl={impl} recs={goals} label={`Implementar: desligar ${goals.length} meta(s)`} size="default" />
          </CardContent>
        </Card>
      )}
      {rebuilds.map((p) => <RebuildCard key={p.id} p={p} c={c} aiOn={aiOn} />)}
      {negatives.map((p) => <NegativeCard key={p.id} p={p} c={c} />)}
    </div>
  );
}
