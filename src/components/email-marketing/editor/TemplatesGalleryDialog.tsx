import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Copy, LayoutTemplate, Loader2, Palette as PaletteIcon, Target } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, PALETTES, READY_TEMPLATES, withAccent, type EmailTemplateSuggestion, type Palette, type ReadyTemplate, type TemplateCategory } from "./templates";
import { EmailPreviewFrame } from "./EmailPreviewFrame";
import { useTemplateContext } from "@/hooks/useTemplateContext";
import type { EmailContent } from "./types";

interface Props {
  hasContent: boolean;
  onApply: (content: EmailContent, suggestion: EmailTemplateSuggestion) => void;
}

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); toast.success("Copiado"); } catch { toast.error("Não foi possível copiar"); }
};

/** Modelos por ocasião, preenchidos com os produtos, o logo e os números reais da loja. */
export function TemplatesGalleryDialog({ hasContent, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<TemplateCategory>("vendas");
  const [selected, setSelected] = useState<ReadyTemplate | null>(null);
  const [paletteId, setPaletteId] = useState<string | null>(null); // null = a do modelo
  const [accent, setAccent] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const { data: ctx, loading } = useTemplateContext(open);

  const paletteFor = (t: ReadyTemplate): Palette => withAccent(PALETTES[paletteId ?? t.palette], accent ?? undefined);
  const build = (t: ReadyTemplate): EmailContent | null => (ctx ? t.build({ ...ctx, palette: paletteFor(t) }) : null);
  const list = useMemo(() => READY_TEMPLATES.filter((t) => t.category === category), [category]);
  const selectedContent = useMemo(() => (selected ? build(selected) : null), [selected, ctx, paletteId, accent]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    if (!selected || !selectedContent) return;
    onApply(selectedContent, { subject: selected.subjects[0], preheader: selected.preheader, subjects: selected.subjects });
    setConfirm(false); setOpen(false); setSelected(null);
    toast.success(`Modelo "${selected.name}" aplicado`, { description: "Troque textos, cupom e links. O assunto sugerido já foi preenchido se estava vazio." });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSelected(null); }}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-2"><LayoutTemplate className="h-4 w-4" />Modelos</Button>
        </DialogTrigger>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{selected ? selected.name : "Modelos por ocasião"}</DialogTitle>
            <DialogDescription>
              {selected ? selected.occasion : "Cada modelo já vem com os seus produtos mais vendidos, o logo e a estrutura que mais converte. Troque o que quiser."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 flex-wrap shrink-0 border-y py-2">
            <PaletteIcon className="h-4 w-4 text-muted-foreground" />
            <button type="button" onClick={() => setPaletteId(null)} className={`text-xs px-2 py-1 rounded border ${paletteId === null ? "border-primary bg-primary/10" : ""}`}>Cor do modelo</button>
            {["dark", "light", "vibrant", "gold"].map((id) => (
              <button key={id} type="button" onClick={() => setPaletteId(id)} title={PALETTES[id].label}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${paletteId === id ? "border-primary bg-primary/10" : ""}`}>
                <span className="h-3.5 w-3.5 rounded-full border" style={{ background: `linear-gradient(135deg, ${PALETTES[id].heroBg} 50%, ${PALETTES[id].accent} 50%)` }} />{PALETTES[id].label}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-xs ml-auto">
              Cor de destaque
              <input type="color" value={accent ?? "#22c55e"} onChange={(e) => setAccent(e.target.value)} className="h-6 w-8 cursor-pointer rounded border bg-transparent" />
              {accent && <button type="button" className="underline text-muted-foreground" onClick={() => setAccent(null)}>padrão</button>}
            </label>
          </div>

          {loading || !ctx ? (
            <div className="flex-1 flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : selected && selectedContent ? (
            <div className="flex-1 min-h-0 grid md:grid-cols-[1fr_320px] gap-4 overflow-hidden">
              <div className="overflow-y-auto rounded-lg border bg-muted/30 p-3">
                <div className="mx-auto" style={{ width: 600, zoom: 0.8 } as React.CSSProperties}><EmailPreviewFrame content={selectedContent} mode="desktop" compact /></div>
              </div>
              <div className="overflow-y-auto space-y-4 text-sm">
                <Button type="button" variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setSelected(null)}><ArrowLeft className="h-4 w-4" />Todos os modelos</Button>
                <div className="rounded-lg border p-3">
                  <p className="font-medium flex items-center gap-1.5 mb-1"><Target className="h-4 w-4 text-primary" />Por que converte</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">{selected.strategy}</p>
                </div>
                <div className="space-y-1.5">
                  <p className="font-medium">Assuntos sugeridos</p>
                  {selected.subjects.map((s) => (
                    <button key={s} type="button" onClick={() => copy(s)} className="w-full text-left text-xs rounded border p-2 hover:bg-accent flex gap-2 items-start">
                      <Copy className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" /><span>{s}</span>
                    </button>
                  ))}
                  <p className="text-[11px] text-muted-foreground">Pré-header: {selected.preheader}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">Confira o endereço, o cupom e as condições (frete, parcelamento, prazo) antes de enviar. Tudo é editável.</p>
                <Button type="button" className="w-full" onClick={() => (hasContent ? setConfirm(true) : apply())}>Usar este modelo</Button>
              </div>
            </div>
          ) : (
            <>
              <Tabs value={category} onValueChange={(v) => setCategory(v as TemplateCategory)} className="shrink-0">
                <TabsList>{CATEGORIES.map((c) => <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>)}</TabsList>
              </Tabs>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-4 pb-2">
                {list.map((t) => {
                  const c = build(t);
                  return (
                    <button key={t.id} type="button" onClick={() => setSelected(t)} className="text-left border rounded-lg overflow-hidden hover:border-primary hover:shadow-md transition bg-card">
                      <div className="h-64 overflow-hidden bg-muted pointer-events-none">
                        {c && <div style={{ width: 600, transform: "scale(0.42)", transformOrigin: "top left" }}><EmailPreviewFrame content={c} mode="desktop" compact /></div>}
                      </div>
                      <div className="p-3 border-t">
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.occasion}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir o e-mail atual?</AlertDialogTitle>
            <AlertDialogDescription>O modelo "{selected?.name}" vai trocar todo o conteúdo do editor. Dá para desfazer com Ctrl+Z logo em seguida.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
