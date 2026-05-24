import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, Plus, Trash2 } from "lucide-react";
import type { SenderRow } from "@/hooks/useEmailIntegrationForm";

interface Props {
  senders: SenderRow[];
  loadingSenders: boolean;
  activeSendersCount: number;
  onAdd: () => void;
  onUpdate: (index: number, field: keyof SenderRow, value: any) => void;
  onRemove: (index: number) => void;
}

export function EmailIntegrationSenders({
  senders, loadingSenders, activeSendersCount, onAdd, onUpdate, onRemove,
}: Props) {
  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Remetentes para Rotação</Label>
            {activeSendersCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeSendersCount + 1} remetente{activeSendersCount > 0 ? "s" : ""} ativos
              </Badge>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cadastre múltiplos endereços de remetente para rotação automática em campanhas.
          O remetente principal acima é sempre incluído.
        </p>

        {loadingSenders && <p className="text-xs text-muted-foreground">Carregando remetentes...</p>}

        {senders.map((sender, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input
                placeholder="Nome (ex: Promoções)"
                value={sender.sender_name}
                onChange={(e) => onUpdate(idx, "sender_name", e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                type="email"
                placeholder="email@empresa.com"
                value={sender.sender_email}
                onChange={(e) => onUpdate(idx, "sender_email", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Switch checked={sender.is_active} onCheckedChange={(v) => onUpdate(idx, "is_active", v)} />
            <Button
              type="button" variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => onRemove(idx)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
}
