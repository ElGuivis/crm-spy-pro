import { Label } from "@/components/ui/label";
import { FileSpreadsheet, ImagePlus, X } from "lucide-react";

interface Props {
  mediaFile: File | null;
  mediaPreview: string | null;
  onMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveMedia: () => void;
}

export function CampaignMediaUpload({ mediaFile, mediaPreview, onMediaUpload, onRemoveMedia }: Props) {
  return (
    <div className="space-y-2">
      <Label>Mídia (opcional)</Label>
      {mediaPreview ? (
        <div className="relative inline-block">
          {mediaFile?.type.startsWith("image/") ? (
            <img src={mediaPreview} alt="Preview" className="h-24 w-24 object-cover rounded-lg border border-border" />
          ) : mediaFile?.type.startsWith("video/") ? (
            <video src={mediaPreview} className="h-24 w-24 object-cover rounded-lg border border-border" />
          ) : (
            <div className="h-24 w-24 flex items-center justify-center rounded-lg border border-border bg-muted">
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mt-1">{mediaFile?.name.split(".").pop()}</span>
            </div>
          )}
          <button
            type="button"
            onClick={onRemoveMedia}
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center hover:border-primary/30 transition-colors">
          <input
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            onChange={onMediaUpload}
            className="hidden"
            id="media-upload"
          />
          <label htmlFor="media-upload" className="cursor-pointer flex items-center justify-center gap-2">
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Imagem, vídeo, áudio ou documento (máx. 10MB)</span>
          </label>
        </div>
      )}
    </div>
  );
}
