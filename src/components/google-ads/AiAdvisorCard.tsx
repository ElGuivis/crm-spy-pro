import { useEffect, useState } from "react";
import { Bot, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { GoogleAdsAccount } from "@/hooks/useGoogleAds";
import { useGoogleAdsAiActions, useGoogleAdsAiAdvice, useGoogleAdsAiProviders } from "@/hooks/useGoogleAdsAi";

const MAX_QUESTION = 500;
const SUGGESTIONS = [
  "Devo pausar tudo e criar campanhas novas ou retomar as que já existem?",
  "O que posso fazer para vender mais sem passar do meu teto?",
  "Quais sinais me dizem que devo pausar uma campanha nos próximos 30 dias?",
];

/** Lê o guardrails.ai_* da conta (IA vem DESLIGADA). */
function readAi(g: unknown) {
  const o = (g && typeof g === "object" ? g : {}) as Record<string, unknown>;
  return { enabled: o.ai_enabled === true, provider: typeof o.ai_provider === "string" ? o.ai_provider : "", model: typeof o.ai_model === "string" ? o.ai_model : "" };
}

/** Negrito (**texto**) e títulos (## ...) do parecer, sem biblioteca de markdown. */
function AdviceText({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h4 key={i} className="pt-2 text-sm font-semibold">{line.slice(3)}</h4>;
        if (!line.trim()) return null;
        return (
          <p key={i}>
            {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}
          </p>
        );
      })}
    </div>
  );
}

interface Props { account: GoogleAdsAccount; canEdit: boolean }

/** Consultor com IA: escolhe entre as IAs já integradas no CRM e pede um parecer sobre retomar x recriar campanhas. */
export function AiAdvisorCard({ account, canEdit }: Props) {
  const saved = readAi(account.guardrails);
  const providers = useGoogleAdsAiProviders(canEdit);
  const advice = useGoogleAdsAiAdvice(account.id);
  const { saveAi, ask } = useGoogleAdsAiActions(account.id);
  const [provider, setProvider] = useState(saved.provider);
  const [model, setModel] = useState(saved.model);
  const [question, setQuestion] = useState("");

  useEffect(() => { setProvider(saved.provider); setModel(saved.model); }, [saved.provider, saved.model]);

  const list = providers.data ?? [];
  const current = list.find((p) => p.id === provider);
  const modelValid = !!current?.models.some((m) => m.id === model);
  const dirty = provider !== saved.provider || (model || (current?.models[0].id ?? "")) !== (saved.model || (current?.models[0].id ?? ""));
  const pickProvider = (id: string) => { setProvider(id); setModel(list.find((p) => p.id === id)?.models[0].id ?? ""); };
  const save = (enabled: boolean) => saveAi.mutate({ enabled, provider: provider || null, model: modelValid ? model : (current?.models[0].id ?? null) });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5" /> Consultor com IA</CardTitle>
        <p className="text-sm text-muted-foreground">
          As regras acima decidem os números. A IA entra só para dar um parecer em linguagem simples (retomar ou recriar, riscos, ideias de teste). Ela não altera nada no Google Ads.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <div className="text-sm">
            <div className="font-medium">Usar IA nesta conta: {saved.enabled ? "ligada" : "desligada"}</div>
            <div className="text-muted-foreground">Ao ligar, o parecer envia à IA escolhida um resumo com números e nomes das campanhas. Nenhum dado de cliente é enviado.</div>
          </div>
          <Switch checked={saved.enabled} disabled={!canEdit || saveAi.isPending || (!saved.enabled && !current)}
            onCheckedChange={save} aria-label="Usar IA" />
        </div>

        {providers.isLoading ? <p className="text-sm text-muted-foreground">Carregando as IAs integradas…</p> : list.length === 0 ? (
          <Alert><Info className="h-4 w-4" /><AlertDescription>Nenhuma IA integrada. Cadastre a chave de um provedor em Integrações.</AlertDescription></Alert>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>IA (provedor)</Label>
              <Select value={provider} onValueChange={pickProvider} disabled={!canEdit}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Escolha a IA" /></SelectTrigger>
                <SelectContent>{list.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}{p.is_default ? " (padrão do CRM)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Modelo</Label>
              <Select value={modelValid ? model : ""} onValueChange={setModel} disabled={!canEdit || !current}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Escolha o modelo" /></SelectTrigger>
                <SelectContent>{(current?.models ?? []).map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="secondary" disabled={!canEdit || !provider || !dirty || saveAi.isPending} onClick={() => save(saved.enabled)}>
              Salvar escolha
            </Button>
          </div>
        )}

        {saved.enabled && (
          <div className="space-y-2">
            <Label htmlFor="ai-question">Sua pergunta (opcional)</Label>
            <Textarea id="ai-question" rows={2} maxLength={MAX_QUESTION} value={question} disabled={!canEdit}
              placeholder="Ex.: devo pausar tudo e criar campanhas novas, ou retomar as antigas?" onChange={(e) => setQuestion(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <Button key={s} size="sm" variant="outline" className="h-auto whitespace-normal py-1 text-left text-xs" onClick={() => setQuestion(s)}>{s}</Button>)}
            </div>
            <Button disabled={!canEdit || ask.isPending || dirty} onClick={() => ask.mutate(question)}>
              {ask.isPending ? "A IA está analisando…" : "Pedir parecer à IA"}
            </Button>
            {dirty && <span className="ml-2 text-xs text-muted-foreground">Salve a escolha antes de pedir o parecer.</span>}
          </div>
        )}

        {advice.data && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {providers.data?.find((p) => p.id === advice.data?.provider)?.label ?? advice.data.provider} · {advice.data.model}
                {advice.data.tokensInput != null && ` · ${advice.data.tokensInput + (advice.data.tokensOutput ?? 0)} tokens`}
              </span>
              <span>{advice.data.generatedAt ? new Date(advice.data.generatedAt).toLocaleString("pt-BR") : ""}</span>
            </div>
            {advice.data.question && <p className="text-xs italic text-muted-foreground">Pergunta: {advice.data.question}</p>}
            <AdviceText text={advice.data.text} />
            <p className="border-t pt-2 text-xs text-muted-foreground">
              A IA pode errar e não conhece margem, estoque nem promoções. Trate como opinião e confira os números. Quem aplica mudanças são as regras e o seu clique.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
