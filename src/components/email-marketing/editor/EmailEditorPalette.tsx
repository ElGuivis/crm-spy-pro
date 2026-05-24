import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus } from "lucide-react";
import { blockCategories, blockLabels } from "./blockTemplates";
import type { ColumnTarget } from "@/hooks/useEmailEditor";

interface Props {
  columnTarget: ColumnTarget | null;
  onClearColumnTarget: () => void;
  onAddBlock: (blockType: string) => void;
}

export function EmailEditorPalette({ columnTarget, onClearColumnTarget, onAddBlock }: Props) {
  // Filter block types that can go inside columns (no nested columns)
  const columnBlockCategories = blockCategories.map((cat) => ({
    ...cat,
    blocks: cat.blocks.filter((b) => b !== "columns-2" && b !== "columns-3"),
  })).filter((cat) => cat.blocks.length > 0);

  return (
    <div className="w-64 border-r bg-muted/30">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Blocos</h3>
        {columnTarget && (
          <div className="mt-2 p-2 rounded bg-primary/10 border border-primary/30">
            <p className="text-xs font-medium text-primary">
              Adicionando em: {columnTarget.columnKey.replace("column", "Coluna ")}
            </p>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2 mt-1" onClick={onClearColumnTarget}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="h-[calc(100%-60px)]">
        <div className="p-4 space-y-4">
          {(columnTarget ? columnBlockCategories : blockCategories).map((category) => (
            <div key={category.name}>
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">{category.name}</h4>
              <div className="space-y-1">
                {category.blocks.map((blockType) => (
                  <Button
                    key={blockType}
                    variant="outline" size="sm"
                    className="w-full justify-start"
                    onClick={() => onAddBlock(blockType)}
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    {blockLabels[blockType]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
