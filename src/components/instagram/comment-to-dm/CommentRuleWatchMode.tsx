import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Target, Globe, X, Image, Film } from "lucide-react";

interface Props {
  mediaType: "post" | "reel";
  watchMode: "all" | "specific";
  selectedMediaId: string | null;
  selectedMediaCaption: string | null;
  onSelectAll: () => void;
  onOpenMediaSelector: () => void;
  onClearSpecific: () => void;
}

export function CommentRuleWatchMode({
  mediaType, watchMode, selectedMediaId, selectedMediaCaption,
  onSelectAll, onOpenMediaSelector, onClearSpecific,
}: Props) {
  const MediaIcon = mediaType === "reel" ? Film : Image;

  return (
    <div className="space-y-3">
      <Label className="text-sm font-semibold flex items-center gap-1.5">
        <Target className="h-4 w-4 text-muted-foreground" />
        Aplicar em
      </Label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-sm transition-all ${
            watchMode === "all" ? "border-[hsl(var(--instagram))] bg-[hsl(var(--instagram))]/5" : "border-border hover:border-muted-foreground/40"
          }`}
        >
          <Globe className={`h-4 w-4 ${watchMode === "all" ? "text-[hsl(var(--instagram))]" : "text-muted-foreground"}`} />
          <div className="text-left">
            <div className="font-medium text-xs">Todos os {mediaType === "post" ? "posts" : "reels"}</div>
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenMediaSelector}
          className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-sm transition-all ${
            watchMode === "specific" ? "border-[hsl(var(--instagram))] bg-[hsl(var(--instagram))]/5" : "border-border hover:border-muted-foreground/40"
          }`}
        >
          <Target className={`h-4 w-4 ${watchMode === "specific" ? "text-[hsl(var(--instagram))]" : "text-muted-foreground"}`} />
          <div className="text-left">
            <div className="font-medium text-xs">{selectedMediaId ? "Alterar publicação" : "Escolher publicação"}</div>
          </div>
        </button>
      </div>

      {watchMode === "specific" && selectedMediaId && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 text-sm border">
          <MediaIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground truncate flex-1 text-xs">{selectedMediaCaption || `ID: ${selectedMediaId}`}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClearSpecific}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
