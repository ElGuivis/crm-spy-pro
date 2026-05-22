import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database, Shield } from "lucide-react";

interface ToolsProps {
  orderEnabled: boolean; setOrderEnabled: (v: boolean) => void;
  orderMode: string; setOrderMode: (v: string) => void;
  orderTemplate: string; setOrderTemplate: (v: string) => void;
}

export function AIAgentEditorTabTools({ orderEnabled, setOrderEnabled, orderMode, setOrderMode, orderTemplate, setOrderTemplate }: ToolsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" />Verificação de Pedidos</CardTitle>
        <CardDescription>Permite ao agente consultar pedidos e rastreios do cliente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Ativar verificação de pedidos</Label>
            <p className="text-xs text-muted-foreground">O agente poderá consultar pedidos via CPF ou número do pedido</p>
          </div>
          <Switch checked={orderEnabled} onCheckedChange={setOrderEnabled} />
        </div>
        {orderEnabled && (
          <>
            <div className="space-y-1.5">
              <Label>Modo de verificação</Label>
              <Select value={orderMode} onValueChange={setOrderMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="order_number">Número do pedido</SelectItem>
                  <SelectItem value="sequential">Sequencial (CPF + Pedido)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template de detalhes do pedido</Label>
              <Textarea value={orderTemplate} onChange={(e) => setOrderTemplate(e.target.value)} rows={4} placeholder="Pedido #{numero}&#10;Status: {status}&#10;Rastreio: {rastreio}" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface EscalationProps {
  transferKw: string; setTransferKw: (v: string) => void;
}

export function AIAgentEditorTabEscalation({ transferKw, setTransferKw }: EscalationProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />Transbordo Humano</CardTitle>
        <CardDescription>Palavras-chave que ativam a transferência para um atendente humano</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Palavras-chave (separadas por vírgula)</Label>
          <Textarea value={transferKw} onChange={(e) => setTransferKw(e.target.value)} rows={2} placeholder="atendente, humano, pessoa real, falar com alguém..." />
          <p className="text-xs text-muted-foreground">Quando o cliente enviar uma dessas palavras, a conversa será transferida para um atendente humano.</p>
        </div>
      </CardContent>
    </Card>
  );
}
