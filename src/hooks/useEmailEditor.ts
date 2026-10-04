import { useCallback, useState } from "react";
import { toast } from "sonner";
import { EmailBlock, EmailContent } from "@/components/email-marketing/editor/types";
import { blockTemplates } from "@/components/email-marketing/editor/blockTemplates";
import { generateEmailHTML } from "@/components/email-marketing/editor/htmlGenerator";
import { useEditorHistory } from "@/hooks/useEditorHistory";

export interface ColumnTarget {
  blockIndex: number;
  columnKey: "column1" | "column2" | "column3";
}

export interface ColumnPath {
  blockIndex: number;
  columnKey: string;
  childIndex: number;
}

interface Options {
  initialContent?: EmailContent;
  onChange?: (content: EmailContent, html: string) => void;
}

type Columned = Record<string, EmailBlock[] | undefined>;

/** Copia o bloco pai trocando só a lista de uma coluna (sem alterar o estado anterior, que o desfazer guarda). */
function withColumn(content: EmailContent, blockIndex: number, columnKey: string, fn: (column: EmailBlock[]) => EmailBlock[]): EmailContent {
  const blocks = [...content.blocks];
  const parent = { ...(blocks[blockIndex] as unknown as Columned) };
  parent[columnKey] = fn([...(parent[columnKey] ?? [])]);
  blocks[blockIndex] = parent as unknown as EmailBlock;
  return { ...content, blocks };
}

export function useEmailEditor({ initialContent, onChange }: Options) {
  const apply = useCallback((c: EmailContent) => onChange?.(c, generateEmailHTML(c)), [onChange]);
  const history = useEditorHistory<EmailContent>(initialContent || { blocks: [], globalStyles: {} }, apply);
  const content = history.value;
  const commit = history.commit;
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [selectedColumnPath, setSelectedColumnPath] = useState<ColumnPath | null>(null);
  const [columnTarget, setColumnTarget] = useState<ColumnTarget | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [viewMode, setViewMode] = useState<"editor" | "preview" | "code">("editor");

  const clearSelectionState = () => { setSelectedBlockIndex(null); setSelectedColumnPath(null); };

  const handleUndo = () => { history.undo(); clearSelectionState(); };
  const handleRedo = () => { history.redo(); clearSelectionState(); };

  const handleAddBlock = (blockType: string) => {
    const template = blockTemplates[blockType];
    if (!template) return;
    const newBlock = JSON.parse(JSON.stringify(template)) as EmailBlock;

    if (columnTarget) {
      const current = (content.blocks[columnTarget.blockIndex] as unknown as Columned | undefined)?.[columnTarget.columnKey] ?? [];
      commit(withColumn(content, columnTarget.blockIndex, columnTarget.columnKey, (col) => [...col, newBlock]));
      setSelectedBlockIndex(null);
      setSelectedColumnPath({ blockIndex: columnTarget.blockIndex, columnKey: columnTarget.columnKey, childIndex: current.length });
      toast.success("Bloco adicionado na coluna");
      return;
    }

    commit({ ...content, blocks: [...content.blocks, newBlock] });
    setSelectedBlockIndex(content.blocks.length);
    setSelectedColumnPath(null);
    toast.success("Bloco adicionado");
  };

  /** Insere vários blocos de uma vez (modelos prontos); `replace` troca o conteúdo atual. */
  const handleInsertBlocks = (blocks: EmailBlock[], replace = false, globalStyles?: EmailContent["globalStyles"]) => {
    const fresh = JSON.parse(JSON.stringify(blocks)) as EmailBlock[];
    commit({
      ...content,
      blocks: replace ? fresh : [...content.blocks, ...fresh],
      globalStyles: replace && globalStyles ? globalStyles : content.globalStyles,
    });
    clearSelectionState();
    setColumnTarget(null);
  };

  const handleUpdateBlock = (index: number, updates: Partial<EmailBlock>) => {
    const blocks = [...content.blocks];
    blocks[index] = { ...blocks[index], ...updates } as EmailBlock;
    commit({ ...content, blocks }, `b${index}:${Object.keys(updates).sort().join(",")}`);
  };

  const handleUpdateColumnChild = (blockIndex: number, columnKey: string, childIndex: number, updates: Partial<EmailBlock>) => {
    commit(
      withColumn(content, blockIndex, columnKey, (col) => { col[childIndex] = { ...col[childIndex], ...updates } as EmailBlock; return col; }),
      `c${blockIndex}.${columnKey}.${childIndex}:${Object.keys(updates).sort().join(",")}`,
    );
  };

  const handleDeleteBlock = (index: number) => {
    commit({ ...content, blocks: content.blocks.filter((_, i) => i !== index) });
    clearSelectionState();
    if (columnTarget && columnTarget.blockIndex === index) setColumnTarget(null);
    toast.success("Bloco removido");
  };

  const handleDeleteColumnChild = (blockIndex: number, columnKey: string, childIndex: number) => {
    commit(withColumn(content, blockIndex, columnKey, (col) => col.filter((_, i) => i !== childIndex)));
    setSelectedColumnPath(null);
    toast.success("Bloco removido da coluna");
  };

  const handleDuplicateBlock = (index: number) => {
    const copy = JSON.parse(JSON.stringify(content.blocks[index])) as EmailBlock;
    commit({ ...content, blocks: [...content.blocks.slice(0, index + 1), copy, ...content.blocks.slice(index + 1)] });
    toast.success("Bloco duplicado");
  };

  /** Move o bloco para outra posição (usado pelo arrastar e soltar). */
  const handleReorderBlock = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= content.blocks.length || to >= content.blocks.length) return;
    const blocks = [...content.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    commit({ ...content, blocks });
    setSelectedBlockIndex(to);
    setSelectedColumnPath(null);
  };

  const handleMoveBlock = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= content.blocks.length) return;
    handleReorderBlock(index, target);
  };

  const handleMoveColumnChild = (blockIndex: number, columnKey: string, childIndex: number, direction: "up" | "down") => {
    const target = direction === "up" ? childIndex - 1 : childIndex + 1;
    const size = (content.blocks[blockIndex] as unknown as Columned | undefined)?.[columnKey]?.length ?? 0;
    if (target < 0 || target >= size) return;
    commit(withColumn(content, blockIndex, columnKey, (col) => { [col[childIndex], col[target]] = [col[target], col[childIndex]]; return col; }));
    setSelectedColumnPath({ blockIndex, columnKey, childIndex: target });
  };

  const getSelectedBlock = (): EmailBlock | null => {
    if (selectedColumnPath) {
      const parent = content.blocks[selectedColumnPath.blockIndex] as unknown as Columned | undefined;
      return parent?.[selectedColumnPath.columnKey]?.[selectedColumnPath.childIndex] || null;
    }
    if (selectedBlockIndex !== null) return content.blocks[selectedBlockIndex] || null;
    return null;
  };

  const handlePropertiesUpdate = (updates: Partial<EmailBlock>) => {
    if (selectedColumnPath) {
      handleUpdateColumnChild(selectedColumnPath.blockIndex, selectedColumnPath.columnKey, selectedColumnPath.childIndex, updates);
    } else if (selectedBlockIndex !== null) {
      handleUpdateBlock(selectedBlockIndex, updates);
    }
  };

  const handleGlobalStylesChange = (updates: Partial<NonNullable<EmailContent["globalStyles"]>>) => {
    const cleaned = { ...(content.globalStyles ?? {}), ...updates };
    (Object.keys(cleaned) as Array<keyof typeof cleaned>).forEach((k) => { if (cleaned[k] === undefined) delete cleaned[k]; });
    commit({ ...content, globalStyles: cleaned }, `g:${Object.keys(updates).sort().join(",")}`);
  };

  const clearSelection = () => { setColumnTarget(null); clearSelectionState(); };

  return {
    content, selectedBlockIndex, selectedColumnPath, columnTarget,
    previewMode, viewMode,
    setSelectedBlockIndex, setSelectedColumnPath, setColumnTarget,
    setPreviewMode, setViewMode,
    handleAddBlock, handleInsertBlocks, handleMoveBlock, handleReorderBlock, handleMoveColumnChild,
    handleDeleteBlock, handleDeleteColumnChild, handleDuplicateBlock,
    getSelectedBlock, handlePropertiesUpdate, handlePropertiesClose: clearSelectionState,
    handleGlobalStylesChange, clearSelection,
    undo: handleUndo, redo: handleRedo, canUndo: history.canUndo, canRedo: history.canRedo,
  };
}

export function getBaseInlineStyles(block: EmailBlock): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (block.backgroundColor) styles.backgroundColor = block.backgroundColor;
  if (block.borderRadius) styles.borderRadius = block.borderRadius;
  return styles;
}
