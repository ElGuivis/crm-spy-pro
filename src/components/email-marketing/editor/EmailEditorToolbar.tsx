import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Monitor, Smartphone, Code, Undo2, Redo2 } from "lucide-react";
import { EmailGlobalStyles } from "./EmailGlobalStyles";
import type { EmailContent } from "./types";
import type { ReactNode } from "react";

interface Props {
  viewMode: "editor" | "preview" | "code";
  previewMode: "desktop" | "mobile";
  onViewModeChange: (v: "editor" | "preview" | "code") => void;
  onPreviewModeChange: (v: "desktop" | "mobile") => void;
  globalStyles: NonNullable<EmailContent["globalStyles"]>;
  onGlobalStylesChange: (updates: Partial<NonNullable<EmailContent["globalStyles"]>>) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** botões extras (ex.: modelos prontos) */
  extra?: ReactNode;
  /** controles só da pré-visualização (ver como cliente, tema escuro) */
  previewExtra?: ReactNode;
}

export function EmailEditorToolbar({ viewMode, previewMode, onViewModeChange, onPreviewModeChange, globalStyles, onGlobalStylesChange, onUndo, onRedo, canUndo, canRedo, extra, previewExtra }: Props) {
  return (
    <div className="border-b p-4 flex flex-wrap items-center justify-between gap-2 bg-background">
      <div className="flex items-center gap-2">
        <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as typeof viewMode)}>
          <TabsList>
            <TabsTrigger value="editor">
              <Eye className="h-4 w-4 mr-2" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Monitor className="h-4 w-4 mr-2" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code">
              <Code className="h-4 w-4 mr-2" />
              HTML
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={!canUndo} onClick={onUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={!canRedo} onClick={onRedo} title="Refazer (Ctrl+Y)" aria-label="Refazer">
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {extra}
        <EmailGlobalStyles styles={globalStyles} onChange={onGlobalStylesChange} />
        {viewMode === "preview" && (
          <div className="flex flex-wrap gap-2">
            {previewExtra}
            <Button variant={previewMode === "desktop" ? "default" : "outline"} size="sm" onClick={() => onPreviewModeChange("desktop")}>
              <Monitor className="h-4 w-4 mr-2" />
              Desktop
            </Button>
            <Button variant={previewMode === "mobile" ? "default" : "outline"} size="sm" onClick={() => onPreviewModeChange("mobile")}>
              <Smartphone className="h-4 w-4 mr-2" />
              Mobile
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
