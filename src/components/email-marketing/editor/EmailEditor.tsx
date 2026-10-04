import { EmailContent } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { EmailPreviewFrame } from "./EmailPreviewFrame";
import { BlockPropertiesPanel } from "./BlockPropertiesPanel";
import { generateEmailHTML } from "./htmlGenerator";
import { useEmailEditor } from "@/hooks/useEmailEditor";
import { EmailEditorPalette } from "./EmailEditorPalette";
import { EmailEditorToolbar } from "./EmailEditorToolbar";
import { EmailEditorCanvas } from "./EmailEditorCanvas";

interface EmailEditorProps {
  initialContent?: EmailContent;
  onChange?: (content: EmailContent, html: string) => void;
}

export function EmailEditor({ initialContent, onChange }: EmailEditorProps) {
  const editor = useEmailEditor({ initialContent, onChange });
  const generatedHTML = generateEmailHTML(editor.content);

  return (
    <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-background">
      <EmailEditorPalette
        columnTarget={editor.columnTarget}
        onClearColumnTarget={() => editor.setColumnTarget(null)}
        onAddBlock={editor.handleAddBlock}
      />

      <div className="flex-1 flex flex-col">
        <EmailEditorToolbar
          viewMode={editor.viewMode}
          previewMode={editor.previewMode}
          onViewModeChange={editor.setViewMode}
          onPreviewModeChange={editor.setPreviewMode}
          globalStyles={editor.content.globalStyles ?? {}}
          onGlobalStylesChange={editor.handleGlobalStylesChange}
        />

        <ScrollArea className="flex-1">
          {editor.viewMode === "editor" && (
            <EmailEditorCanvas
              content={editor.content}
              selectedBlockIndex={editor.selectedBlockIndex}
              selectedColumnPath={editor.selectedColumnPath}
              columnTarget={editor.columnTarget}
              onClearSelection={editor.clearSelection}
              onSelectBlock={(i) => { editor.setSelectedBlockIndex(i); editor.setSelectedColumnPath(null); }}
              onMoveBlock={editor.handleMoveBlock}
              onDuplicateBlock={editor.handleDuplicateBlock}
              onDeleteBlock={editor.handleDeleteBlock}
              onSelectColumnSlot={(parentIndex, columnKey) => {
                editor.setColumnTarget({ blockIndex: parentIndex, columnKey });
                editor.setSelectedBlockIndex(null);
                editor.setSelectedColumnPath(null);
              }}
              onSelectColumnChild={(parentIndex, columnKey, childIdx) => {
                editor.setSelectedColumnPath({ blockIndex: parentIndex, columnKey, childIndex: childIdx });
                editor.setSelectedBlockIndex(null);
                editor.setColumnTarget({ blockIndex: parentIndex, columnKey: columnKey as any });
              }}
              onMoveColumnChild={editor.handleMoveColumnChild}
              onDeleteColumnChild={editor.handleDeleteColumnChild}
            />
          )}

          {editor.viewMode === "preview" && (
            <EmailPreviewFrame content={editor.content} mode={editor.previewMode} />
          )}

          {editor.viewMode === "code" && (
            <div className="p-8">
              <Card className="p-4">
                <pre className="text-xs overflow-x-auto">
                  <code>{generatedHTML}</code>
                </pre>
              </Card>
            </div>
          )}
        </ScrollArea>
      </div>

      {(editor.selectedBlockIndex !== null || editor.selectedColumnPath !== null) && editor.viewMode === "editor" && (
        <BlockPropertiesPanel
          block={editor.getSelectedBlock()}
          onUpdate={editor.handlePropertiesUpdate}
          onClose={editor.handlePropertiesClose}
        />
      )}
    </div>
  );
}
