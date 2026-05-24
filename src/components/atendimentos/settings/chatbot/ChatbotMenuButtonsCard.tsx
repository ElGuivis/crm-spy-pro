import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Plus, Trash2 } from "lucide-react";
import type { MenuButton } from "@/hooks/useChatbotBuilder";

interface Props {
  buttons: MenuButton[];
  onAdd: () => void;
  onUpdate: (idx: number, updates: Partial<MenuButton>) => void;
  onRemove: (idx: number) => void;
}

export function ChatbotMenuButtonsCard({ buttons, onAdd, onUpdate, onRemove }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Menu de Opções
        </CardTitle>
        <CardDescription>
          Opções interativas apresentadas ao cliente. O cliente digita o número ou texto correspondente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {buttons.map((btn, idx) => (
          <div key={btn.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-xs shrink-0 w-6 h-6 flex items-center justify-center">
                {idx + 1}
              </Badge>
              <Input
                value={btn.text}
                onChange={(e) => onUpdate(idx, { text: e.target.value })}
                placeholder="Texto da opção (ex: 📦 Rastrear pedido)"
                className="flex-1 min-w-[150px]"
              />
              <Select value={btn.action} onValueChange={(v) => onUpdate(idx, { action: v as MenuButton["action"] })}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="respond">Resposta fixa</SelectItem>
                  <SelectItem value="order_lookup">Buscar pedido</SelectItem>
                  <SelectItem value="transfer_human">Transferir para humano</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(idx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {btn.action === "respond" && (
              <Textarea
                value={btn.response || ""}
                onChange={(e) => onUpdate(idx, { response: e.target.value })}
                placeholder="Resposta que será enviada ao cliente..."
                rows={2}
              />
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-1">
          <Plus className="h-4 w-4" />
          Adicionar opção
        </Button>
      </CardContent>
    </Card>
  );
}
