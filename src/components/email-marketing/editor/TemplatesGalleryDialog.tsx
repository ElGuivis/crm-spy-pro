import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LayoutTemplate } from "lucide-react";
import { READY_TEMPLATES, type ReadyTemplate } from "./readyTemplates";
import { EmailPreviewFrame } from "./EmailPreviewFrame";

interface Props {
  hasContent: boolean;
  onApply: (template: ReadyTemplate) => void;
}

/** Modelos prontos: mostra uma miniatura de cada um e aplica no editor (pedindo confirmação se já há conteúdo). */
export function TemplatesGalleryDialog({ hasContent, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ReadyTemplate | null>(null);

  const choose = (t: ReadyTemplate) => {
    if (hasContent) { setPending(t); return; }
    onApply(t); setOpen(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-2"><LayoutTemplate className="h-4 w-4" />Modelos</Button>
        </DialogTrigger>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modelos prontos</DialogTitle>
            <DialogDescription>Escolha um ponto de partida e troque textos, imagens e links. Imagens e links de exemplo precisam ser trocados antes do envio.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {READY_TEMPLATES.map((t) => (
              <button key={t.id} type="button" onClick={() => choose(t)} className="text-left border rounded-lg overflow-hidden hover:border-primary hover:shadow-md transition">
                <div className="h-56 overflow-hidden bg-muted pointer-events-none relative">
                  <div style={{ width: 600, transform: "scale(0.4)", transformOrigin: "top left" }}>
                    <EmailPreviewFrame content={t.content} mode="desktop" compact />
                  </div>
                </div>
                <div className="p-3 border-t">
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir o e-mail atual?</AlertDialogTitle>
            <AlertDialogDescription>O modelo "{pending?.name}" vai trocar todo o conteúdo do editor. Dá para desfazer com Ctrl+Z logo em seguida.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pending) onApply(pending); setPending(null); setOpen(false); }}>Substituir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
