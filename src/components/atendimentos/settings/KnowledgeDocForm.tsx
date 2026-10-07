import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { KNOWLEDGE_LIMITS, type KnowledgeDocInput } from "@/hooks/useKnowledgeDocs";

interface Props {
  initial: KnowledgeDocInput;
  saving: boolean;
  onSave: (doc: KnowledgeDocInput) => void;
  onCancel: () => void;
}

/** Formulário de um documento da base de conhecimento (criar ou editar). */
export function KnowledgeDocForm({ initial, saving, onSave, onCancel }: Props) {
  const [doc, setDoc] = useState<KnowledgeDocInput>(initial);
  const valid = doc.title.trim().length > 0 && doc.content.trim().length > 0;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="kb-title">Título</Label>
          <Input id="kb-title" maxLength={KNOWLEDGE_LIMITS.title} placeholder="Ex.: Como funciona a troca" value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kb-category">Categoria (opcional)</Label>
          <Input id="kb-category" maxLength={KNOWLEDGE_LIMITS.category} placeholder="Ex.: Trocas" value={doc.category} onChange={(e) => setDoc({ ...doc, category: e.target.value })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="kb-content">Conteúdo</Label>
        <Textarea id="kb-content" rows={6} maxLength={KNOWLEDGE_LIMITS.content} placeholder="Escreva a resposta como o atendente falaria. Um assunto por documento." value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} />
        <p className="text-xs text-muted-foreground">{doc.content.length}/{KNOWLEDGE_LIMITS.content}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={doc.is_active} onChange={(e) => setDoc({ ...doc, is_active: e.target.checked })} />
        Ativo (a IA pode usar este documento)
      </label>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" disabled={!valid || saving} onClick={() => onSave(doc)}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={onCancel}><X className="h-4 w-4" />Cancelar</Button>
      </div>
    </div>
  );
}
