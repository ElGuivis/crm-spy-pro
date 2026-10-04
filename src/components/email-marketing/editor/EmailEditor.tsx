import { useCallback, useEffect } from "react";
import { EmailContent } from "./types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";
import { EmailPreviewFrame } from "./EmailPreviewFrame";
import { BlockPropertiesPanel } from "./BlockPropertiesPanel";
import { generateEmailHTML } from "./htmlGenerator";
import { useEmailEditor } from "@/hooks/useEmailEditor";
import { useEditorDraft } from "@/hooks/useEditorDraft";
import { EmailEditorPalette } from "./EmailEditorPalette";
import { EmailEditorToolbar } from "./EmailEditorToolbar";
import { EmailEditorCanvas } from "./EmailEditorCanvas";
import { TemplatesGalleryDialog } from "./TemplatesGalleryDialog";
import { ShowcaseDialog } from "./ShowcaseDialog";
import type { EmailTemplateSuggestion } from "./templates";

interface EmailEditorProps {
  initialContent?: EmailContent;
  onChange?: (content: EmailContent, html: string) => void;
  /** identifica o rascunho automático no navegador (inclua a versão salva, ex.: id + updated_at) */
  draftKey?: string;
  /** assunto e pré-header sugeridos pelo modelo escolhido (o formulário preenche se estiverem vazios) */
  onTemplateApplied?: (s: EmailTemplateSuggestion) => void;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function EmailEditor({ initialContent, onChange, draftKey, onTemplateApplied }: EmailEditorProps) {
  const draft = useEditorDraft(draftKey, initialContent);
  const handleChange = useCallback((c: EmailContent, html: string) => { onChange?.(c, html); draft.schedule(c); }, [onChange, draft.schedule]); // eslint-disable-line react-hooks/exhaustive-deps
  const editor = useEmailEditor({ initialContent, onChange: handleChange });
  const generatedHTML = generateEmailHTML(editor.content);
  const { undo, redo } = editor;

  // Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z) fora dos campos de texto (que têm o desfazer do próprio navegador)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-background">
      {draft.restorable && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-900">
          <span className="flex items-center gap-2"><History className="h-4 w-4" />Há alterações não salvas desta edição, guardadas automaticamente neste navegador.</span>
          <span className="flex gap-2">
            <Button type="button" size="sm" onClick={() => { const r = draft.restorable!.content; editor.handleInsertBlocks(r.blocks, true, r.globalStyles); draft.discard(); }}>Restaurar</Button>
            <Button type="button" size="sm" variant="ghost" onClick={draft.discard}>Descartar</Button>
          </span>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
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
          onUndo={editor.undo}
          onRedo={editor.redo}
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          extra={<><ShowcaseDialog onInsert={(blocks) => editor.handleInsertBlocks(blocks)} /><TemplatesGalleryDialog hasContent={editor.content.blocks.length > 0} onApply={(c, sug) => { editor.handleInsertBlocks(c.blocks, true, c.globalStyles); onTemplateApplied?.(sug); }} /></>}
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
              onReorderBlock={editor.handleReorderBlock}
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
    </div>
  );
}
