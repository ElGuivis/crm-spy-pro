import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock } from "lucide-react";

interface Props {
  bufferEnabled: boolean; setBufferEnabled: (v: boolean) => void;
  bufferDelay: number; setBufferDelay: (v: number) => void;
  inactivityEnabled: boolean; setInactivityEnabled: (v: boolean) => void;
  inactivityTimeout: number; setInactivityTimeout: (v: number) => void;
  inactivityMessage: string; setInactivityMessage: (v: string) => void;
}

export function AIAgentEditorTabBehavior({ bufferEnabled, setBufferEnabled, bufferDelay, setBufferDelay, inactivityEnabled, setInactivityEnabled, inactivityTimeout, setInactivityTimeout, inactivityMessage, setInactivityMessage }: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Buffer de Mensagens</CardTitle>
          <CardDescription>Agrupa mensagens recebidas em sequência antes de processar, evitando respostas fragmentadas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Ativar buffer</Label>
              <p className="text-xs text-muted-foreground">Aguarda um intervalo antes de responder para acumular mensagens</p>
            </div>
            <Switch checked={bufferEnabled} onCheckedChange={setBufferEnabled} />
          </div>
          {bufferEnabled && (
            <div className="space-y-2">
              <Label>Delay: {bufferDelay}s</Label>
              <Slider value={[bufferDelay]} onValueChange={([v]) => setBufferDelay(v)} min={3} max={30} step={1} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Inatividade</CardTitle>
          <CardDescription>Encerra conversas inativas automaticamente após um período</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Ativar encerramento por inatividade</Label>
              <p className="text-xs text-muted-foreground">Fecha a conversa se o cliente não responder no tempo configurado</p>
            </div>
            <Switch checked={inactivityEnabled} onCheckedChange={setInactivityEnabled} />
          </div>
          {inactivityEnabled && (
            <>
              <div className="space-y-2">
                <Label>Timeout: {inactivityTimeout} minutos</Label>
                <Slider value={[inactivityTimeout]} onValueChange={([v]) => setInactivityTimeout(v)} min={5} max={120} step={5} />
              </div>
              <div className="space-y-1.5">
                <Label>Mensagem de encerramento</Label>
                <Textarea value={inactivityMessage} onChange={(e) => setInactivityMessage(e.target.value)} rows={2} placeholder="Por inatividade estamos finalizando a conversa..." />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
