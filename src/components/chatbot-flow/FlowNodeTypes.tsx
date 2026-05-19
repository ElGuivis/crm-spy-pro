import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, HelpCircle, GitBranch, Zap, Flag, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const HEADER: Record<string, { color: string; Icon: React.FC<{ className?: string }>; label: string }> = {
  start:     { color: "bg-green-500",   Icon: Play,          label: "Início"   },
  message:   { color: "bg-blue-500",    Icon: MessageSquare, label: "Mensagem" },
  question:  { color: "bg-violet-500",  Icon: HelpCircle,    label: "Pergunta" },
  condition: { color: "bg-orange-500",  Icon: GitBranch,     label: "Condição" },
  action:    { color: "bg-teal-600",    Icon: Zap,           label: "Ação"     },
  end:       { color: "bg-red-500",     Icon: Flag,          label: "Fim"      },
};

function getPreview(type: string, cfg: Record<string, unknown>): string {
  if (type === "start")     return String(cfg.welcome_message || "Mensagem de boas-vindas…").slice(0, 45);
  if (type === "message")   return String(cfg.text || "Texto da mensagem…").slice(0, 45);
  if (type === "question")  return String(cfg.text || "Pergunta para o usuário…").slice(0, 45);
  if (type === "condition") return `${cfg.variable ?? "var"} ${cfg.operator ?? "="} ${cfg.value ?? "?"}`;
  if (type === "action")    return String(cfg.action_type ?? "Definir variável");
  if (type === "end")       return String(cfg.final_message || "Conversa encerrada");
  return "";
}

type NodeData = { config?: Record<string, unknown>; label?: string; is_entry?: boolean };

function Shell({ type, data, selected, children }: { type: string; data: NodeData; selected?: boolean; children?: React.ReactNode }) {
  const meta = HEADER[type];
  if (!meta) return null;
  const { Icon, color, label } = meta;
  return (
    <div className={cn(
      "rounded-lg border-2 bg-card shadow-sm min-w-[160px] max-w-[220px] text-left",
      selected ? "border-primary ring-1 ring-primary" : "border-border/60",
    )}>
      <div className={cn("px-2.5 py-1.5 rounded-t-md flex items-center gap-1.5 text-xs font-semibold text-white", color)}>
        <Icon className="h-3 w-3 shrink-0" />
        {data.label || label}
      </div>
      <div className="px-2.5 py-2 text-[11px] text-muted-foreground line-clamp-2">
        {getPreview(type, data.config ?? {})}
      </div>
      {children}
    </div>
  );
}

export function StartNode({ data, selected }: NodeProps) {
  return (
    <Shell type="start" data={data as NodeData} selected={selected}>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !border-green-700" />
    </Shell>
  );
}

export function MessageNode({ data, selected }: NodeProps) {
  return (
    <Shell type="message" data={data as NodeData} selected={selected}>
      <Handle type="target" position={Position.Top}    className="!bg-blue-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500" />
    </Shell>
  );
}

export function QuestionNode({ data, selected }: NodeProps) {
  const cfg = (data as NodeData).config ?? {};
  const buttons = (cfg.buttons as { id: string; label: string }[] | undefined) ?? [];
  return (
    <Shell type="question" data={data as NodeData} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-violet-400" />
      {buttons.length > 0 && (
        <div className="px-2.5 pb-2 flex flex-wrap gap-1">
          {buttons.map((btn) => (
            <span key={btn.id} className="text-[10px] bg-violet-100 text-violet-700 rounded px-1.5 py-0.5">{btn.label}</span>
          ))}
        </div>
      )}
      {buttons.length > 0 ? (
        buttons.map((btn, i) => (
          <Handle
            key={btn.id}
            id={btn.id}
            type="source"
            position={Position.Bottom}
            style={{ left: `${((i + 1) / (buttons.length + 1)) * 100}%` }}
            className="!bg-violet-500"
          />
        ))
      ) : (
        <Handle type="source" position={Position.Bottom} className="!bg-violet-500" />
      )}
    </Shell>
  );
}

export function ConditionNode({ data, selected }: NodeProps) {
  return (
    <Shell type="condition" data={data as NodeData} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-orange-400" />
      <div className="px-2.5 pb-2 flex justify-between text-[10px] text-muted-foreground">
        <span className="text-green-600 font-medium">Sim</span>
        <span className="text-red-500 font-medium">Não</span>
      </div>
      <Handle id="true"  type="source" position={Position.Bottom} style={{ left: "28%" }} className="!bg-green-500" />
      <Handle id="false" type="source" position={Position.Bottom} style={{ left: "72%" }} className="!bg-red-500"   />
    </Shell>
  );
}

export function ActionNode({ data, selected }: NodeProps) {
  return (
    <Shell type="action" data={data as NodeData} selected={selected}>
      <Handle type="target" position={Position.Top}    className="!bg-teal-400" />
      <Handle type="source" position={Position.Bottom} className="!bg-teal-600" />
    </Shell>
  );
}

export function EndNode({ data, selected }: NodeProps) {
  return (
    <Shell type="end" data={data as NodeData} selected={selected}>
      <Handle type="target" position={Position.Top} className="!bg-red-400" />
    </Shell>
  );
}

export const nodeTypes = {
  start:     StartNode,
  message:   MessageNode,
  question:  QuestionNode,
  condition: ConditionNode,
  action:    ActionNode,
  end:       EndNode,
};
