import { useState, type ReactNode } from "react";
import { Menu, MoreVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOpenMobileMenu } from "@/contexts/MobileMenuContext";
import { cn } from "@/lib/utils";

export interface AtendimentosSection { value: string; label: string; icon: ReactNode }

interface Props {
  sections: AtendimentosSection[];
  active: string;
  onChange: (value: string) => void;
  /** seletor de inbox (só aparece em Conversas) */
  inboxSelector?: ReactNode;
}

/** Cabeçalho do Atendimentos no celular: menu principal, nome da seção, inbox e as demais seções numa folha (em vez de 7 ícones sem nome). */
export function AtendimentosMobileHeader({ sections, active, onChange, inboxSelector }: Props) {
  const openMenu = useOpenMobileMenu();
  const [open, setOpen] = useState(false);
  const current = sections.find((s) => s.value === active);

  return (
    <div className="flex items-center gap-2 px-2 py-2 border-b bg-card shrink-0 safe-area-top">
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={openMenu} aria-label="Abrir menu">
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-base font-semibold truncate">{current?.label ?? "Atendimentos"}</h1>
      <div className="flex-1 min-w-0 flex justify-end">{inboxSelector && <div className="w-full max-w-[11rem]">{inboxSelector}</div>}</div>
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setOpen(true)} aria-label="Seções do atendimento">
        <MoreVertical className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-6">
          <SheetHeader className="text-left"><SheetTitle>Atendimentos</SheetTitle></SheetHeader>
          <div className="mt-3 grid gap-1">
            {sections.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => { onChange(s.value); setOpen(false); }}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-3 text-left text-base min-h-[48px]", s.value === active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}
              >
                <span className="shrink-0">{s.icon}</span>
                <span className="flex-1">{s.label}</span>
                {s.value === active && <Check className="h-4 w-4" />}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
