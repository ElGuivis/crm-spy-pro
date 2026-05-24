import { Button } from "@/components/ui/button";
import { Plus, ChevronUp, ChevronDown, Copy, Trash2 } from "lucide-react";
import { BlockRenderer } from "./BlockRenderer";
import { EmailColumnSlot } from "./EmailColumnSlot";
import { getBaseInlineStyles } from "@/hooks/useEmailEditor";
import type { EmailBlock, EmailContent, Columns2Block, Columns3Block } from "./types";
import type { ColumnTarget, ColumnPath } from "@/hooks/useEmailEditor";

interface Props {
  content: EmailContent;
  selectedBlockIndex: number | null;
  selectedColumnPath: ColumnPath | null;
  columnTarget: ColumnTarget | null;
  onClearSelection: () => void;
  onSelectBlock: (index: number) => void;
  onMoveBlock: (index: number, direction: "up" | "down") => void;
  onDuplicateBlock: (index: number) => void;
  onDeleteBlock: (index: number) => void;
  onSelectColumnSlot: (parentIndex: number, columnKey: "column1" | "column2" | "column3") => void;
  onSelectColumnChild: (parentIndex: number, columnKey: string, childIdx: number) => void;
  onMoveColumnChild: (parentIndex: number, columnKey: string, childIdx: number, direction: "up" | "down") => void;
  onDeleteColumnChild: (parentIndex: number, columnKey: string, childIdx: number) => void;
}

const isColumnBlock = (block: EmailBlock) => block.type === "columns-2" || block.type === "columns-3";

export function EmailEditorCanvas({
  content, selectedBlockIndex, selectedColumnPath, columnTarget,
  onClearSelection, onSelectBlock, onMoveBlock, onDuplicateBlock, onDeleteBlock,
  onSelectColumnSlot, onSelectColumnChild, onMoveColumnChild, onDeleteColumnChild,
}: Props) {
  const renderColumn = (parentIndex: number, columnKey: "column1" | "column2" | "column3", blocks: EmailBlock[]) => (
    <EmailColumnSlot
      parentIndex={parentIndex}
      columnKey={columnKey}
      blocks={blocks}
      columnTarget={columnTarget}
      selectedColumnPath={selectedColumnPath}
      onSelectSlot={() => onSelectColumnSlot(parentIndex, columnKey)}
      onSelectChild={(childIdx) => onSelectColumnChild(parentIndex, columnKey, childIdx)}
      onMoveChild={(childIdx, direction) => onMoveColumnChild(parentIndex, columnKey, childIdx, direction)}
      onDeleteChild={(childIdx) => onDeleteColumnChild(parentIndex, columnKey, childIdx)}
    />
  );

  return (
    <div className="p-8" onClick={onClearSelection}>
      <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm border min-h-[600px]">
        {content.blocks.length === 0 ? (
          <div className="flex items-center justify-center h-[600px] text-center p-8">
            <div>
              <div className="rounded-full bg-muted p-6 inline-block mb-4">
                <Plus className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Comece adicionando blocos</h3>
              <p className="text-muted-foreground mb-6">
                Escolha um bloco na barra lateral para começar a construir seu e-mail
              </p>
            </div>
          </div>
        ) : (
          <div>
            {content.blocks.map((block, index) => (
              <div
                key={index}
                className={`relative group ${selectedBlockIndex === index ? "ring-2 ring-primary" : ""}`}
                onClick={(e) => { e.stopPropagation(); onSelectBlock(index); if (!isColumnBlock(block)) { /* clear column target handled in hook */ } }}
              >
                {block.type === "columns-2" ? (
                  <div style={{ ...getBaseInlineStyles(block), display: "flex", gap: (block as Columns2Block).columnGap || "20px", padding: block.padding || "20px" }}>
                    <div style={{ flex: 1 }}>{renderColumn(index, "column1", (block as Columns2Block).column1 || [])}</div>
                    <div style={{ flex: 1 }}>{renderColumn(index, "column2", (block as Columns2Block).column2 || [])}</div>
                  </div>
                ) : block.type === "columns-3" ? (
                  <div style={{ ...getBaseInlineStyles(block), display: "flex", gap: (block as Columns3Block).columnGap || "15px", padding: block.padding || "20px" }}>
                    <div style={{ flex: 1 }}>{renderColumn(index, "column1", (block as Columns3Block).column1 || [])}</div>
                    <div style={{ flex: 1 }}>{renderColumn(index, "column2", (block as Columns3Block).column2 || [])}</div>
                    <div style={{ flex: 1 }}>{renderColumn(index, "column3", (block as Columns3Block).column3 || [])}</div>
                  </div>
                ) : (
                  <BlockRenderer block={block} />
                )}

                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20">
                  <Button size="icon" variant="secondary" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onMoveBlock(index, "up"); }}
                    disabled={index === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="secondary" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onMoveBlock(index, "down"); }}
                    disabled={index === content.blocks.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="secondary" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onDuplicateBlock(index); }}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="destructive" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onDeleteBlock(index); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
