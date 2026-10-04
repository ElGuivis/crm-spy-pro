import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bold, Italic, Underline, Link2 } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}

/**
 * Caixa de texto com barra de formatação. Marca o trecho selecionado com a sintaxe que o e-mail entende:
 * **negrito**, *itálico*, __sublinhado__ e [texto](link).
 */
export function FormattedTextarea({ value, onChange, rows = 6, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  const wrap = (before: string, after: string, fallbackText: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end) || fallbackText;
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    wrap("[", `](${/^https?:\/\//i.test(url) ? url : `https://${url}`})`, "texto do link");
    setLinkUrl("");
    setLinkOpen(false);
  };

  const tool = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <Button type="button" variant="outline" size="icon" className="h-7 w-7" title={label} aria-label={label} onClick={onClick}>{icon}</Button>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {tool("Negrito", <Bold className="h-3.5 w-3.5" />, () => wrap("**", "**", "negrito"))}
        {tool("Itálico", <Italic className="h-3.5 w-3.5" />, () => wrap("*", "*", "itálico"))}
        {tool("Sublinhado", <Underline className="h-3.5 w-3.5" />, () => wrap("__", "__", "sublinhado"))}
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="h-7 w-7" title="Link" aria-label="Link"><Link2 className="h-3.5 w-3.5" /></Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-2" align="start">
            <p className="text-xs text-muted-foreground">Selecione o texto antes e informe o endereço.</p>
            <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }} />
            <Button type="button" size="sm" className="w-full" onClick={applyLink}>Aplicar link</Button>
          </PopoverContent>
        </Popover>
      </div>
      <Textarea ref={ref} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
