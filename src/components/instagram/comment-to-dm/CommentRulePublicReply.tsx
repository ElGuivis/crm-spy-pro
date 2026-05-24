import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { MessageSquare, Plus, X } from "lucide-react";

interface Props {
  enabled: boolean;
  variants: string[];
  newVariant: string;
  onEnabledChange: (v: boolean) => void;
  onNewVariantChange: (v: string) => void;
  onAddVariant: () => void;
  onRemoveVariant: (idx: number) => void;
}

export function CommentRulePublicReply({
  enabled, variants, newVariant, onEnabledChange, onNewVariantChange, onAddVariant, onRemoveVariant,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          Resposta pública (comentário)
        </Label>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && (
        <div className="space-y-2 pl-1">
          <div className="flex gap-2">
            <Input
              value={newVariant}
              onChange={(e) => onNewVariantChange(e.target.value)}
              placeholder="Ex: Enviamos no seu DM! 🚀"
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAddVariant())}
              className="text-sm"
            />
            <Button variant="outline" size="icon" onClick={onAddVariant} type="button" className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {variants.length > 0 && (
            <div className="space-y-1.5">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 px-3 py-2 rounded-lg">
                  <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}.</span>
                  <span className="flex-1 text-xs">{v}</span>
                  <button onClick={() => onRemoveVariant(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Variações rotacionam automaticamente.</p>
        </div>
      )}
    </div>
  );
}
