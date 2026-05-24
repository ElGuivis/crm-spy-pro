import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  orderEnabled: boolean;
  orderMode: string;
  orderTemplate: string;
  onOrderEnabledChange: (v: boolean) => void;
  onOrderModeChange: (v: string) => void;
  onOrderTemplateChange: (v: string) => void;
}

export function ChatbotOrderLookupCard({
  orderEnabled, orderMode, orderTemplate,
  onOrderEnabledChange, onOrderModeChange, onOrderTemplateChange,
}: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Consulta de Pedidos
        </CardTitle>
        <CardDescription>Permitir que o chatbot busque informações de pedidos automaticamente</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Busca de pedidos habilitada</Label>
          <Switch checked={orderEnabled} onCheckedChange={onOrderEnabledChange} />
        </div>
        {orderEnabled && (
          <>
            <div>
              <Label>Verificação do cliente</Label>
              <Select value={orderMode} onValueChange={onOrderModeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="none">Sem verificação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template de exibição do pedido</Label>
              <Textarea
                value={orderTemplate}
                onChange={(e) => onOrderTemplateChange(e.target.value)}
                rows={4}
                placeholder="📦 Pedido: {{numero}}&#10;Status: {{status}}&#10;Rastreio: {{rastreio}}"
                className="mt-1 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variáveis: {"{{numero}}"}, {"{{status}}"}, {"{{rastreio}}"}, {"{{valor}}"}, {"{{data}}"}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
