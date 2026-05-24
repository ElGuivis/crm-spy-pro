import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { Zap, Plus, X, Send } from "lucide-react";

interface Props {
  keywords: string[];
  newKeyword: string;
  dmMessage: string;
  onNewKeywordChange: (v: string) => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (kw: string) => void;
  onDmMessageChange: (v: string) => void;
}

export function CommentRuleSingleMode({
  keywords, newKeyword, dmMessage, onNewKeywordChange, onAddKeyword, onRemoveKeyword, onDmMessageChange,
}: Props) {
  return (
    <TabsContent value="single" className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-warning" />
          Palavras-chave (gatilho)
        </Label>
        <div className="flex gap-2">
          <Input
            value={newKeyword}
            onChange={(e) => onNewKeywordChange(e.target.value)}
            placeholder="Ex: QUERO, LINK, INFO"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onAddKeyword())}
            className="text-sm"
          />
          <Button variant="outline" size="icon" onClick={onAddKeyword} type="button" className="shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map(kw => (
              <Badge key={kw} variant="secondary" className="gap-1 pl-2.5 pr-1 py-1 font-mono text-xs">
                {kw}
                <button onClick={() => onRemoveKeyword(kw)} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {keywords.length === 0 ? "Sem palavras-chave = responde a todos os comentários" : `${keywords.length} gatilho${keywords.length > 1 ? "s" : ""}`}
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium flex items-center gap-1.5">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          Mensagem da DM
        </Label>
        <Textarea
          value={dmMessage}
          onChange={(e) => onDmMessageChange(e.target.value)}
          placeholder="Ex: Olá! Aqui está o link que você pediu 🔗 https://..."
          rows={3}
          className="text-sm resize-none"
        />
      </div>
    </TabsContent>
  );
}
