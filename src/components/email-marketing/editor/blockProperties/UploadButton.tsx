import { Upload, Loader2 } from "lucide-react";

interface Props {
  field: string;
  uploading: boolean;
  onSelect: (file: File, field: string) => void;
}

export function UploadButton({ field, uploading, onSelect }: Props) {
  return (
    <label className={`flex items-center justify-center gap-2 w-full border border-input rounded-md px-3 py-1.5 text-sm cursor-pointer hover:bg-accent transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      {uploading ? "Enviando..." : "Fazer upload"}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f, field);
          e.target.value = "";
        }}
      />
    </label>
  );
}
