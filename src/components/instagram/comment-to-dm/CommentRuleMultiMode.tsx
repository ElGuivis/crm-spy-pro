import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { Tag, Plus, Trash2 } from "lucide-react";
import type { KeywordResponse } from "@/hooks/useInstagramAutomations";

interface Props {
  keywordResponses: KeywordResponse[];
  newKrKeyword: string;
  newKrMessage: string;
  onNewKrKeywordChange: (v: string) => void;
  onNewKrMessageChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (keyword: string) => void;
}

export function CommentRuleMultiMode({
  keywordResponses, newKrKeyword, newKrMessage,
  onNewKrKeywordChange, onNewKrMessageChange, onAdd, onRemove,
}: Props) {
  return (
    <TabsContent value="multi" className="space-y-4 mt-4">
      <div className="rounded-xl border border-dashed border-[hsl(var(--instagram))]/30 bg-[hsl(var(--instagram))]/5 p-3">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Modo Live Shop:</strong> Cada palavra-chave envia uma DM diferente. Ideal para lives com múltiplos produtos.
        </p>
      </div>

      <div className="space-y-2 p-3 rounded-xl border bg-muted/30">
        <div className="flex items-center gap-2">
          <Tag className="h-3.5 w-3.5 text-[hsl(var(--instagram))]" />
          <Label className="text-xs font-medium">Novo produto</Label>
        </div>
        <Input value={newKrKeyword} onChange={(e) => onNewKrKeywordChange(e.target.value)} placeholder="Palavra-chave (ex: prod1)" className="text-sm" />
        <Textarea value={newKrMessage} onChange={(e) => onNewKrMessageChange(e.target.value)} placeholder="Mensagem da DM (ex: Aqui o link: https://...)" rows={2} className="text-sm resize-none" />
        <Button variant="outline" size="sm" onClick={onAdd} disabled={!newKrKeyword.trim() || !newKrMessage.trim()} className="w-full gap-1.5" type="button">
          <Plus className="h-3.5 w-3.5" />
          Adicionar produto
        </Button>
      </div>

      {keywordResponses.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">
            {keywordResponses.length} produto{keywordResponses.length > 1 ? "s" : ""} configurado{keywordResponses.length > 1 ? "s" : ""}
          </Label>
          <div className="space-y-2">
            {keywordResponses.map((kr, i) => (
              <div key={kr.keyword} className="flex items-start gap-3 p-3 rounded-xl border bg-card group">
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[hsl(var(--instagram))]/10 text-[hsl(var(--instagram))] text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <Badge variant="secondary" className="font-mono text-xs">{kr.keyword}</Badge>
                  <p className="text-xs text-muted-foreground line-clamp-2">{kr.dm_message}</p>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
                  onClick={() => onRemove(kr.keyword)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {keywordResponses.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">
          Adicione pelo menos um produto para ativar a regra.
        </p>
      )}
    </TabsContent>
  );
}
