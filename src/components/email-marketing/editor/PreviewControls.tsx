import { useEffect, useState } from "react";
import { Moon, Sun, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { personFromCustomer, SAMPLE_PERSON, type PreviewPerson } from "./previewPersona";

interface Props {
  person: PreviewPerson;
  onPerson: (p: PreviewPerson) => void;
  dark: boolean;
  onDark: (v: boolean) => void;
}
type Hit = { id: string; name: string | null; email: string | null; phone: string | null };

/** Controles da pré-visualização: ver como um cliente real (nome e dados) e simular o tema escuro. */
export function PreviewControls({ person, onPerson, dark, onDark }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, "");
    if (term.length < 3) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from("li_customers").select("id, name, email, phone").or(`name.ilike.%${term}%,email.ilike.%${term}%`).limit(6);
      setHits((data ?? []) as Hit[]);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="flex items-center gap-2 relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} title="Ver o e-mail como um cliente (nome e dados reais)">
        <User className="h-4 w-4 mr-2" />{person.real ? person.first_name || "Cliente" : "Ver como…"}
      </Button>
      {person.real && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onPerson(SAMPLE_PERSON)} aria-label="Voltar ao exemplo"><X className="h-4 w-4" /></Button>}
      <Button variant={dark ? "default" : "outline"} size="sm" onClick={() => onDark(!dark)} title="Simulação do modo escuro dos clientes de e-mail">
        {dark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}Tema escuro
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-72 rounded-md border bg-popover p-2 shadow-md">
          <Input autoFocus placeholder="Nome ou e-mail do cliente (3+ letras)" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-2 max-h-56 overflow-auto">
            {q.trim().length >= 3 && !hits.length && <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum cliente encontrado.</p>}
            {hits.map((h) => (
              <button key={h.id} type="button" className="w-full text-left rounded px-2 py-1.5 hover:bg-muted"
                onClick={() => { onPerson(personFromCustomer(h)); setOpen(false); setQ(""); }}>
                <span className="block text-sm truncate">{h.name || "(sem nome)"}</span>
                <span className="block text-xs text-muted-foreground truncate">{h.email}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 px-1 text-[11px] text-muted-foreground">Só muda a pré-visualização; nada é enviado.</p>
        </div>
      )}
    </div>
  );
}
