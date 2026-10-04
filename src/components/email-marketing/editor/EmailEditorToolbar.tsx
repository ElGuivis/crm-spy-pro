import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Monitor, Smartphone, Code } from "lucide-react";
import { EmailGlobalStyles } from "./EmailGlobalStyles";
import type { EmailContent } from "./types";

interface Props {
  viewMode: "editor" | "preview" | "code";
  previewMode: "desktop" | "mobile";
  onViewModeChange: (v: "editor" | "preview" | "code") => void;
  onPreviewModeChange: (v: "desktop" | "mobile") => void;
  globalStyles: NonNullable<EmailContent["globalStyles"]>;
  onGlobalStylesChange: (updates: Partial<NonNullable<EmailContent["globalStyles"]>>) => void;
}

export function EmailEditorToolbar({ viewMode, previewMode, onViewModeChange, onPreviewModeChange, globalStyles, onGlobalStylesChange }: Props) {
  return (
    <div className="border-b p-4 flex items-center justify-between bg-background">
      <Tabs value={viewMode} onValueChange={(v: any) => onViewModeChange(v)}>
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

      <div className="flex items-center gap-2">
      <EmailGlobalStyles styles={globalStyles} onChange={onGlobalStylesChange} />
      {viewMode === "preview" && (
        <div className="flex gap-2">
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
