import type { Node } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus } from "lucide-react";

const LABELS: Record<string, string> = {
  start: "Início", message: "Mensagem", question: "Pergunta",
  condition: "Condição", action: "Ação", end: "Fim",
};

type Cfg = Record<string, unknown>;

function StartForm({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">Mensagem de boas-vindas</Label>
      <Textarea
        className="mt-1 text-sm"
        rows={4}
        value={String(cfg.welcome_message ?? "")}
        onChange={(e) => set({ ...cfg, welcome_message: e.target.value })}
        placeholder="Olá! Como posso te ajudar? {{nome}}"
      />
      <p className="text-[10px] text-muted-foreground mt-1">Use {"{{variavel}}"} para interpolação</p>
    </div>
  );
}

function MessageForm({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">Texto</Label>
      <Textarea
        className="mt-1 text-sm"
        rows={5}
        value={String(cfg.text ?? "")}
        onChange={(e) => set({ ...cfg, text: e.target.value })}
        placeholder="Sua mensagem aqui…"
      />
      <p className="text-[10px] text-muted-foreground mt-1">Use {"{{variavel}}"} para interpolação</p>
    </div>
  );
}

function QuestionForm({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  const buttons = (cfg.buttons as { id: string; label: string }[]) ?? [];
  const addBtn = () => {
    if (buttons.length >= 3) return;
    set({ ...cfg, buttons: [...buttons, { id: crypto.randomUUID().slice(0, 8), label: "" }] });
  };
  const removeBtn = (id: string) => set({ ...cfg, buttons: buttons.filter((b) => b.id !== id) });
  const updateBtn = (id: string, label: string) =>
    set({ ...cfg, buttons: buttons.map((b) => (b.id === id ? { ...b, label } : b)) });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">Pergunta</Label>
        <Textarea className="mt-1 text-sm" rows={3} value={String(cfg.text ?? "")} onChange={(e) => set({ ...cfg, text: e.target.value })} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs text-muted-foreground">Botões ({buttons.length}/3)</Label>
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={addBtn} disabled={buttons.length >= 3}>
            <Plus className="h-3 w-3 mr-1" />Botão
          </Button>
        </div>
        <div className="space-y-1.5">
          {buttons.map((btn) => (
            <div key={btn.id} className="flex gap-1.5">
              <Input
                value={btn.label}
                onChange={(e) => updateBtn(btn.id, e.target.value)}
                placeholder="Texto do botão"
                className="h-7 text-sm flex-1"
                maxLength={20}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive shrink-0" onClick={() => removeBtn(btn.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Cada botão cria uma saída no nó</p>
      </div>
    </div>
  );
}

function ConditionForm({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  return (
    <div className="space-y-2.5">
      <div>
        <Label className="text-xs text-muted-foreground">Variável</Label>
        <Input className="h-7 text-sm mt-1" value={String(cfg.variable ?? "")} onChange={(e) => set({ ...cfg, variable: e.target.value })} placeholder="ex: resposta" />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Operador</Label>
        <Select value={String(cfg.operator ?? "equals")} onValueChange={(v) => set({ ...cfg, operator: v })}>
          <SelectTrigger className="h-7 text-sm mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="equals">Igual a</SelectItem>
            <SelectItem value="not_equals">Diferente de</SelectItem>
            <SelectItem value="contains">Contém</SelectItem>
            <SelectItem value="starts_with">Começa com</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Valor</Label>
        <Input className="h-7 text-sm mt-1" value={String(cfg.value ?? "")} onChange={(e) => set({ ...cfg, value: e.target.value })} placeholder="ex: sim" />
      </div>
      <p className="text-[10px] text-muted-foreground">Saída esquerda = Sim, direita = Não</p>
    </div>
  );
}

function ActionForm({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  const type = String(cfg.action_type ?? "set_variable");
  return (
    <div className="space-y-2.5">
      <div>
        <Label className="text-xs text-muted-foreground">Tipo de ação</Label>
        <Select value={type} onValueChange={(v) => set({ ...cfg, action_type: v })}>
          <SelectTrigger className="h-7 text-sm mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="set_variable">Definir variável</SelectItem>
            <SelectItem value="assign_tag">Atribuir tag</SelectItem>
            <SelectItem value="transfer_human">Transferir para humano</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {type === "set_variable" && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground">Nome da variável</Label>
            <Input className="h-7 text-sm mt-1" value={String(cfg.variable_name ?? "")} onChange={(e) => set({ ...cfg, variable_name: e.target.value })} placeholder="ex: email_cliente" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor</Label>
            <Input className="h-7 text-sm mt-1" value={String(cfg.variable_value ?? "")} onChange={(e) => set({ ...cfg, variable_value: e.target.value })} placeholder="ex: {{resposta}}" />
          </div>
        </>
      )}
      {type === "assign_tag" && (
        <div>
          <Label className="text-xs text-muted-foreground">Tag</Label>
          <Input className="h-7 text-sm mt-1" value={String(cfg.tag ?? "")} onChange={(e) => set({ ...cfg, tag: e.target.value })} placeholder="ex: interessado" />
        </div>
      )}
      {type === "transfer_human" && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">Conversa será transferida para um atendente humano.</p>
      )}
    </div>
  );
}

function EndForm({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">Mensagem final (opcional)</Label>
      <Textarea className="mt-1 text-sm" rows={3} value={String(cfg.final_message ?? "")} onChange={(e) => set({ ...cfg, final_message: e.target.value })} placeholder="Obrigado! Até logo." />
    </div>
  );
}

interface FlowConfigPanelProps {
  node: Node | null;
  onChange: (nodeId: string, data: Partial<{ config: Cfg; label: string }>) => void;
  onDelete: (nodeId: string) => void;
}

export function FlowConfigPanel({ node, onChange, onDelete }: FlowConfigPanelProps) {
  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center leading-relaxed">
        Selecione um nó no canvas para editar suas propriedades
      </div>
    );
  }

  const type = node.type as string;
  const cfg = ((node.data as Record<string, unknown>).config as Cfg) ?? {};
  const label = String((node.data as Record<string, unknown>).label ?? "");

  const setConfig = (newCfg: Cfg) => onChange(node.id, { config: newCfg });

  return (
    <div className="p-3 space-y-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">{LABELS[type] ?? type}</p>
        {type !== "start" && (
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => onDelete(node.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Rótulo (opcional)</Label>
        <Input className="h-7 text-sm mt-1" value={label} onChange={(e) => onChange(node.id, { label: e.target.value })} placeholder="Nome do nó…" />
      </div>
      <Separator />
      {type === "start"     && <StartForm     cfg={cfg} set={setConfig} />}
      {type === "message"   && <MessageForm   cfg={cfg} set={setConfig} />}
      {type === "question"  && <QuestionForm  cfg={cfg} set={setConfig} />}
      {type === "condition" && <ConditionForm cfg={cfg} set={setConfig} />}
      {type === "action"    && <ActionForm    cfg={cfg} set={setConfig} />}
      {type === "end"       && <EndForm       cfg={cfg} set={setConfig} />}
    </div>
  );
}
