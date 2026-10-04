import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Palette } from "lucide-react";
import { ColorField } from "./blockProperties/fields";
import type { EmailContent } from "./types";

type GlobalStyles = NonNullable<EmailContent["globalStyles"]>;

const FONTS: { label: string; value: string }[] = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia (serifada)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
];

const WIDTHS = ["480px", "520px", "560px", "600px", "640px", "680px"];

interface Props {
  styles: GlobalStyles;
  onChange: (updates: Partial<GlobalStyles>) => void;
}

/** Aparência geral do e-mail: fundo da página, fundo do conteúdo, largura, fonte e cor dos links. */
export function EmailGlobalStyles({ styles, onChange }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Palette className="h-4 w-4" />
          Estilo do e-mail
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <p className="text-sm font-semibold">Aparência geral</p>
        <ColorField label="Fundo da página" value={styles.bodyBackground} fallback="#f4f4f4" onChange={(v) => onChange({ bodyBackground: v })} />
        <ColorField label="Fundo do conteúdo" value={styles.contentBackground} fallback="#ffffff" onChange={(v) => onChange({ contentBackground: v })} />
        <ColorField label="Cor dos links" value={styles.linkColor} fallback="#0066cc" onChange={(v) => onChange({ linkColor: v })} />
        <div className="space-y-1.5">
          <Label className="text-xs">Fonte</Label>
          <Select value={styles.fontFamily || FONTS[0].value} onValueChange={(v) => onChange({ fontFamily: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FONTS.map((f) => <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Largura do e-mail</Label>
          <Select value={styles.contentWidth || "600px"} onValueChange={(v) => onChange({ contentWidth: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WIDTHS.map((w) => <SelectItem key={w} value={w}>{w}{w === "600px" ? " (padrão)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
