import { useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useKnowledgeDocs, type KnowledgeDocInput } from "@/hooks/useKnowledgeDocs";
import { KnowledgeDocForm } from "./KnowledgeDocForm";

const EMPTY: KnowledgeDocInput = { title: "", category: "", content: "", is_active: true };

/** Base de conhecimento da loja: respostas que a IA usa para perguntas frequentes. */
export function KnowledgeDocsCard() {
  const { isAdmin } = useAuth();
  const { docs, isLoading, save, remove } = useKnowledgeDocs();
  const [editing, setEditing] = useState<KnowledgeDocInput | null>(null);

  const handleSave = (doc: KnowledgeDocInput) => save.mutate(doc, { onSuccess: () => setEditing(null) });
  const handleDelete = (id: string, title: string) => {
    if (confirm(`Excluir o documento "${title}"?`)) remove.mutate(id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" />Base de conhecimento</CardTitle>
        <CardDescription>
          Perguntas frequentes, políticas e guias da sua loja. Quando o cliente pergunta algo parecido, a IA responde com base nestes textos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!isLoading && docs.length === 0 && !editing && (
          <p className="text-sm text-muted-foreground italic">Nenhum documento ainda. Comece pelas dúvidas que os clientes mais fazem.</p>
        )}

        {docs.map((d) => (
          <div key={d.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{d.title}</p>
                {d.category && <Badge variant="secondary" className="text-[10px]">{d.category}</Badge>}
                {!d.is_active && <Badge variant="outline" className="text-[10px]">Inativo</Badge>}
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
            </div>
            {isAdmin && (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Editar" onClick={() => setEditing({ id: d.id, title: d.title, category: d.category ?? "", content: d.content, is_active: d.is_active })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Excluir" onClick={() => handleDelete(d.id, d.title)} disabled={remove.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {editing && <KnowledgeDocForm key={editing.id ?? "novo"} initial={editing} saving={save.isPending} onSave={handleSave} onCancel={() => setEditing(null)} />}

        {isAdmin && !editing && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(EMPTY)}><Plus className="h-4 w-4" />Novo documento</Button>
        )}
      </CardContent>
    </Card>
  );
}
