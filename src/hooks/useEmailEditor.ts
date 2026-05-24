import { useState } from "react";
import { toast } from "sonner";
import { EmailBlock, EmailContent } from "@/components/email-marketing/editor/types";
import { blockTemplates } from "@/components/email-marketing/editor/blockTemplates";
import { generateEmailHTML } from "@/components/email-marketing/editor/htmlGenerator";

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

export function useEmailEditor({ initialContent, onChange }: Options) {
  const [content, setContent] = useState<EmailContent>(initialContent || { blocks: [], globalStyles: {} });
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [selectedColumnPath, setSelectedColumnPath] = useState<ColumnPath | null>(null);
  const [columnTarget, setColumnTarget] = useState<ColumnTarget | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [viewMode, setViewMode] = useState<"editor" | "preview" | "code">("editor");

  const notifyChange = (updatedContent: EmailContent) => {
    if (onChange) {
      const html = generateEmailHTML(updatedContent);
      onChange(updatedContent, html);
    }
  };

  const handleAddBlock = (blockType: string) => {
    const template = blockTemplates[blockType];
    if (!template) return;
    const newBlock = JSON.parse(JSON.stringify(template)) as EmailBlock;

    if (columnTarget) {
      const updatedBlocks = [...content.blocks];
      const parentBlock = updatedBlocks[columnTarget.blockIndex] as any;
      if (parentBlock && parentBlock[columnTarget.columnKey]) {
        parentBlock[columnTarget.columnKey] = [...parentBlock[columnTarget.columnKey], newBlock];
      }
      const updatedContent = { ...content, blocks: updatedBlocks };
      setContent(updatedContent);
      notifyChange(updatedContent);
      setSelectedBlockIndex(null);
      setSelectedColumnPath({
        blockIndex: columnTarget.blockIndex,
        columnKey: columnTarget.columnKey,
        childIndex: parentBlock[columnTarget.columnKey].length - 1,
      });
      toast.success("Bloco adicionado na coluna");
      return;
    }

    const updatedBlocks = [...content.blocks, newBlock];
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedBlockIndex(updatedBlocks.length - 1);
    setSelectedColumnPath(null);
    notifyChange(updatedContent);
    toast.success("Bloco adicionado");
  };

  const handleUpdateBlock = (index: number, updates: Partial<EmailBlock>) => {
    const updatedBlocks = [...content.blocks];
    updatedBlocks[index] = { ...updatedBlocks[index], ...updates } as EmailBlock;
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    notifyChange(updatedContent);
  };

  const handleUpdateColumnChild = (blockIndex: number, columnKey: string, childIndex: number, updates: Partial<EmailBlock>) => {
    const updatedBlocks = [...content.blocks];
    const parentBlock = updatedBlocks[blockIndex] as any;
    if (parentBlock && parentBlock[columnKey]) {
      const column = [...parentBlock[columnKey]];
      column[childIndex] = { ...column[childIndex], ...updates };
      parentBlock[columnKey] = column;
    }
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    notifyChange(updatedContent);
  };

  const handleDeleteBlock = (index: number) => {
    const updatedBlocks = content.blocks.filter((_, i) => i !== index);
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedBlockIndex(null);
    setSelectedColumnPath(null);
    if (columnTarget && columnTarget.blockIndex === index) setColumnTarget(null);
    notifyChange(updatedContent);
    toast.success("Bloco removido");
  };

  const handleDeleteColumnChild = (blockIndex: number, columnKey: string, childIndex: number) => {
    const updatedBlocks = [...content.blocks];
    const parentBlock = updatedBlocks[blockIndex] as any;
    if (parentBlock && parentBlock[columnKey]) {
      parentBlock[columnKey] = parentBlock[columnKey].filter((_: any, i: number) => i !== childIndex);
    }
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedColumnPath(null);
    notifyChange(updatedContent);
    toast.success("Bloco removido da coluna");
  };

  const handleDuplicateBlock = (index: number) => {
    const blockToDuplicate = content.blocks[index];
    const duplicatedBlock = JSON.parse(JSON.stringify(blockToDuplicate)) as EmailBlock;
    const updatedBlocks = [
      ...content.blocks.slice(0, index + 1),
      duplicatedBlock,
      ...content.blocks.slice(index + 1),
    ];
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    notifyChange(updatedContent);
    toast.success("Bloco duplicado");
  };

  const handleMoveBlock = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === content.blocks.length - 1) return;
    const updatedBlocks = [...content.blocks];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [updatedBlocks[index], updatedBlocks[targetIndex]] = [updatedBlocks[targetIndex], updatedBlocks[index]];
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedBlockIndex(targetIndex);
    notifyChange(updatedContent);
  };

  const handleMoveColumnChild = (blockIndex: number, columnKey: string, childIndex: number, direction: "up" | "down") => {
    const updatedBlocks = [...content.blocks];
    const parentBlock = updatedBlocks[blockIndex] as any;
    if (!parentBlock || !parentBlock[columnKey]) return;
    const column = [...parentBlock[columnKey]];
    const targetIndex = direction === "up" ? childIndex - 1 : childIndex + 1;
    if (targetIndex < 0 || targetIndex >= column.length) return;
    [column[childIndex], column[targetIndex]] = [column[targetIndex], column[childIndex]];
    parentBlock[columnKey] = column;
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedColumnPath({ blockIndex, columnKey, childIndex: targetIndex });
    notifyChange(updatedContent);
  };

  const getSelectedBlock = (): EmailBlock | null => {
    if (selectedColumnPath) {
      const parent = content.blocks[selectedColumnPath.blockIndex] as any;
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

  const handlePropertiesClose = () => {
    setSelectedBlockIndex(null);
    setSelectedColumnPath(null);
  };

  const clearSelection = () => {
    setColumnTarget(null);
    setSelectedBlockIndex(null);
    setSelectedColumnPath(null);
  };

  return {
    content, selectedBlockIndex, selectedColumnPath, columnTarget,
    previewMode, viewMode,
    setSelectedBlockIndex, setSelectedColumnPath, setColumnTarget,
    setPreviewMode, setViewMode,
    handleAddBlock, handleMoveBlock, handleMoveColumnChild,
    handleDeleteBlock, handleDeleteColumnChild, handleDuplicateBlock,
    getSelectedBlock, handlePropertiesUpdate, handlePropertiesClose,
    clearSelection,
  };
}

export function getBaseInlineStyles(block: EmailBlock): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (block.backgroundColor) styles.backgroundColor = block.backgroundColor;
  if (block.borderRadius) styles.borderRadius = block.borderRadius;
  return styles;
}
