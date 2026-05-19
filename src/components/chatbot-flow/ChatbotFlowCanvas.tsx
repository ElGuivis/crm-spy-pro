import { useState, useCallback } from "react";
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./FlowNodeTypes";
import { FlowConfigPanel } from "./FlowConfigPanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Rocket, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type Cfg = Record<string, unknown>;

const DEFAULT_CONFIGS: Record<string, Cfg> = {
  start:     { welcome_message: "" },
  message:   { text: "" },
  question:  { text: "", buttons: [] },
  condition: { variable: "", operator: "equals", value: "" },
  action:    { action_type: "set_variable", variable_name: "", variable_value: "" },
  end:       { final_message: "" },
};

const PALETTE = [
  { type: "message",   label: "Mensagem"  },
  { type: "question",  label: "Pergunta"  },
  { type: "condition", label: "Condição"  },
  { type: "action",    label: "Ação"      },
  { type: "end",       label: "Fim"       },
  { type: "start",     label: "Início",   extra: "border-green-200 bg-green-50 hover:bg-green-100" },
];

interface Props {
  flowId: string;
  flowName: string;
  onBack: () => void;
}

export function ChatbotFlowCanvas({ flowId, flowName, onBack }: Props) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ["flow-canvas", flowId],
    queryFn: async () => {
      const [{ data: ns }, { data: es }] = await Promise.all([
        supabase.from("chatbot_flow_nodes" as any).select("*").eq("flow_id", flowId),
        supabase.from("chatbot_flow_edges" as any).select("*").eq("flow_id", flowId),
      ]);
      const rfNodes: Node[] = ((ns as any[]) ?? []).map((n) => ({
        id: n.id,
        type: n.node_type,
        position: { x: n.position_x, y: n.position_y },
        data: { config: n.config ?? {}, label: n.label ?? "", is_entry: n.is_entry },
      }));
      const rfEdges: Edge[] = ((es as any[]) ?? []).map((e) => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        sourceHandle: (e.condition as any)?.source_handle ?? null,
        data: { condition: e.condition },
      }));
      setNodes(rfNodes);
      setEdges(rfEdges);
      return true;
    },
    enabled: !!flowId,
    staleTime: Infinity,      // never refetch automatically — user edits are in-memory
    refetchOnWindowFocus: false,
  });

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge({ ...params, id: crypto.randomUUID(), data: { condition: params.sourceHandle ? { source_handle: params.sourceHandle } : null } }, eds),
      ),
    [setEdges],
  );

  const handleAddNode = (type: string) => {
    const id = crypto.randomUUID();
    const isFirst = type === "start" && !nodes.some((n) => n.type === "start");
    setNodes((nds) => [
      ...nds,
      {
        id,
        type,
        position: { x: 100 + Math.random() * 200, y: 80 + nds.length * 80 },
        data: { config: { ...DEFAULT_CONFIGS[type] }, label: "", is_entry: isFirst },
      },
    ]);
    setSelectedId(id);
  };

  const handleNodeDataChange = (nodeId: string, data: Partial<{ config: Cfg; label: string }>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
    );
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  };

  const persistFlow = async () => {
    // Delete all then re-insert (simple replace strategy)
    await supabase.from("chatbot_flow_edges" as any).delete().eq("flow_id", flowId);
    await supabase.from("chatbot_flow_nodes" as any).delete().eq("flow_id", flowId);

    if (nodes.length > 0) {
      const { error } = await supabase.from("chatbot_flow_nodes" as any).insert(
        nodes.map((n) => ({
          id: n.id,
          flow_id: flowId,
          tenant_id: tenantId!,
          node_type: n.type!,
          label: String((n.data as any).label || "") || null,
          config: (n.data as any).config ?? {},
          position_x: n.position.x,
          position_y: n.position.y,
          is_entry: !!(n.data as any).is_entry,
        })),
      );
      if (error) throw error;
    }

    if (edges.length > 0) {
      const { error } = await supabase.from("chatbot_flow_edges" as any).insert(
        edges.map((e) => ({
          id: e.id,
          flow_id: flowId,
          tenant_id: tenantId!,
          source_node_id: e.source,
          target_node_id: e.target,
          condition: e.sourceHandle ? { source_handle: e.sourceHandle } : (e.data as any)?.condition ?? null,
        })),
      );
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await persistFlow();
      toast.success("Flow salvo");
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
    } catch (err) {
      toast.error("Erro ao salvar flow");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await persistFlow();
      const { error } = await supabase
        .from("chatbot_flows" as any)
        .update({ is_published: true, updated_at: new Date().toISOString() })
        .eq("id", flowId);
      if (error) throw error;
      toast.success("Flow publicado — chatbots usando este flow já receberão as mudanças");
      queryClient.invalidateQueries({ queryKey: ["chatbot-flows"] });
    } catch (err) {
      toast.error("Erro ao publicar flow");
      console.error(err);
    } finally {
      setPublishing(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Carregando flow…</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-card shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold flex-1 min-w-0 truncate">{flowName}</span>
        <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="h-7 text-xs gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button size="sm" onClick={handlePublish} disabled={publishing} className="h-7 text-xs gap-1.5">
          <Rocket className="h-3.5 w-3.5" />
          {publishing ? "Publicando…" : "Publicar"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Node palette */}
        <div className="w-36 border-r bg-card p-2 space-y-1 shrink-0 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase px-1 pb-1">Adicionar nó</p>
          {PALETTE.map(({ type, label, extra }) => (
            <button
              key={type}
              onClick={() => handleAddNode(type)}
              className={`w-full text-left text-xs px-2 py-1.5 rounded border hover:bg-muted/70 transition-colors flex items-center gap-1.5 ${extra ?? "border-border/50"}`}
            >
              <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
              {label}
            </button>
          ))}
          <div className="pt-2 text-[10px] text-muted-foreground px-1 leading-snug">
            Arraste as arestas entre os handles para conectar nós.
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background gap={15} size={1} />
            <Controls />
            <MiniMap nodeStrokeWidth={2} zoomable pannable />
          </ReactFlow>
        </div>

        {/* Config panel */}
        <div className="w-56 border-l bg-card shrink-0 overflow-hidden">
          <FlowConfigPanel node={selectedNode} onChange={handleNodeDataChange} onDelete={handleDeleteNode} />
        </div>
      </div>
    </div>
  );
}
