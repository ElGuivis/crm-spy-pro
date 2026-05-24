import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Clock } from "lucide-react";
import type { KeywordRule } from "@/hooks/useChatbotBuilder";

interface Props {
  rules: KeywordRule[];
  onAdd: () => void;
  onUpdate: (idx: number, updates: Partial<KeywordRule>) => void;
  onRemove: (idx: number) => void;
}

export function ChatbotKeywordRulesCard({ rules, onAdd, onUpdate, onRemove }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="h-4 w-4" />
          Regras de Palavras-Chave
        </CardTitle>
        <CardDescription>
          Respostas automáticas quando o cliente envia mensagens com determinadas palavras. Suporta condições avançadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rules.map((rule, idx) => (
          <div key={rule.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                value={rule.keywords.join(", ")}
                onChange={(e) =>
                  onUpdate(idx, { keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                }
                placeholder="Palavras-chave (separadas por vírgula)"
                className="flex-1 min-w-[150px]"
              />
              <Select value={rule.action} onValueChange={(v) => onUpdate(idx, { action: v as KeywordRule["action"] })}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="respond">Responder</SelectItem>
                  <SelectItem value="transfer_column">Transferir</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(idx)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/50 rounded px-2 py-1">
              <Clock className="h-3 w-3 shrink-0" />
              <span>Condições: esta regra dispara se qualquer keyword combinar na mensagem do cliente</span>
            </div>

            {rule.action === "respond" && (
              <Textarea
                value={rule.response || ""}
                onChange={(e) => onUpdate(idx, { response: e.target.value })}
                placeholder="Resposta automática..."
                rows={2}
              />
            )}
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={onAdd} className="gap-1">
          <Plus className="h-4 w-4" />
          Adicionar regra
        </Button>
      </CardContent>
    </Card>
  );
}
