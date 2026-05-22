import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Settings, Info } from "lucide-react";

interface Props {
  systemPrompt: string; setSystemPrompt: (v: string) => void;
  temperature: number; setTemperature: (v: number) => void;
  maxTokens: number; setMaxTokens: (v: number) => void;
}

export function AIAgentEditorTabIntelligence({ systemPrompt, setSystemPrompt, temperature, setTemperature, maxTokens, setMaxTokens }: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Prompt de Sistema</CardTitle>
          <CardDescription>Define a personalidade, tom e conhecimento do agente. Quanto mais detalhado, mais preciso.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted/50 border border-dashed p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground"><Info className="h-3.5 w-3.5" />Dicas para um bom prompt</div>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>Defina a identidade: "Você é [Nome], assistente de [Empresa]..."</li>
              <li>Especifique o tom: formal, amigável, técnico...</li>
              <li>Liste o que o agente pode e não pode fazer</li>
              <li>Inclua informações sobre produtos/serviços relevantes</li>
              <li>Defina como tratar reclamações e dúvidas frequentes</li>
            </ul>
          </div>
          <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={12}
            placeholder={`Você é um assistente virtual da [Nome da Empresa], especializado em atendimento ao cliente.\n\nSeu tom é profissional e amigável. Você deve:\n- Responder perguntas sobre produtos e serviços\n- Ajudar com dúvidas sobre pedidos e entregas\n- Encaminhar reclamações para o setor adequado\n- NÃO discutir assuntos fora do contexto da empresa\n\nInformações importantes:\n- Horário de atendimento humano: Segunda a Sexta, 9h às 18h\n- Para pedidos urgentes, transfira para um atendente`}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" />Parâmetros do Modelo</CardTitle>
          <CardDescription>Controle fino sobre como o modelo gera respostas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Temperatura: {temperature.toFixed(1)}</Label>
                <p className="text-xs text-muted-foreground">Baixo = respostas mais precisas e consistentes · Alto = mais criativo e variado</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {temperature < 0.4 ? "Preciso" : temperature < 0.7 ? "Balanceado" : "Criativo"}
              </Badge>
            </div>
            <Slider value={[temperature]} onValueChange={([v]) => setTemperature(v)} min={0} max={1} step={0.1} className="w-full" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0.0 - Determinístico</span><span>0.5 - Padrão</span><span>1.0 - Aleatório</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <Label>Máximo de tokens: {maxTokens}</Label>
              <p className="text-xs text-muted-foreground">Controla o tamanho máximo da resposta do agente</p>
            </div>
            <Slider value={[maxTokens]} onValueChange={([v]) => setMaxTokens(v)} min={128} max={4096} step={64} className="w-full" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>128 - Curto</span><span>1024 - Padrão</span><span>4096 - Longo</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
