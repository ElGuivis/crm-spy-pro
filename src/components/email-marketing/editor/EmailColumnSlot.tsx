import { Button } from "@/components/ui/button";
import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { BlockRenderer } from "./BlockRenderer";
import type { EmailBlock } from "./types";
import type { ColumnTarget, ColumnPath } from "@/hooks/useEmailEditor";

interface Props {
  parentIndex: number;
  columnKey: string;
  blocks: EmailBlock[];
  columnTarget: ColumnTarget | null;
  selectedColumnPath: ColumnPath | null;
  onSelectSlot: () => void;
  onSelectChild: (childIdx: number) => void;
  onMoveChild: (childIdx: number, direction: "up" | "down") => void;
  onDeleteChild: (childIdx: number) => void;
}

export function EmailColumnSlot({
  parentIndex, columnKey, blocks,
  columnTarget, selectedColumnPath,
  onSelectSlot, onSelectChild, onMoveChild, onDeleteChild,
}: Props) {
  const isTarget = columnTarget?.blockIndex === parentIndex && columnTarget?.columnKey === columnKey;

  return (
    <div
      className={`min-h-[50px] border border-dashed rounded p-1 transition-colors cursor-pointer ${
        isTarget ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
      }`}
      onClick={(e) => { e.stopPropagation(); onSelectSlot(); }}
    >
      {blocks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
          <Plus className="h-4 w-4 mb-1" />
          <span className="text-xs">Clique e adicione</span>
        </div>
      ) : (
        blocks.map((childBlock, childIdx) => {
          const isSelected = selectedColumnPath?.blockIndex === parentIndex
            && selectedColumnPath?.columnKey === columnKey
            && selectedColumnPath?.childIndex === childIdx;
          return (
            <div
              key={childIdx}
              className={`relative group/child ${isSelected ? "ring-2 ring-primary rounded" : ""}`}
              onClick={(e) => { e.stopPropagation(); onSelectChild(childIdx); }}
            >
              <BlockRenderer block={childBlock} />
              <div className="absolute top-0 right-0 opacity-0 group-hover/child:opacity-100 transition-opacity flex gap-0.5 z-10">
                <Button size="icon" variant="secondary" className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onMoveChild(childIdx, "up"); }}
                  disabled={childIdx === 0}>
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="secondary" className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onMoveChild(childIdx, "down"); }}
                  disabled={childIdx === blocks.length - 1}>
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="destructive" className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); onDeleteChild(childIdx); }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
