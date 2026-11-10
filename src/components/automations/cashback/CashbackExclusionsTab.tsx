import { useState } from "react";
import { Loader2, Trash2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCashbackExclusions } from "@/hooks/useCashbackStatement";

const empty = { name: "", email: "", phone: "", reason: "" };

/** Quem está aqui nunca ganha cashback (funcionários, parceiros, clientes bloqueados por fraude). */
export function CashbackExclusionsTab({ enabled }: { enabled: boolean }) {
  const { list, add, remove } = useCashbackExclusions(enabled);
  const { toast } = useToast();
  const [form, setForm] = useState(empty);
  const canAdd = form.email.trim() !== "" || form.phone.trim() !== "";

  const submit = () => add.mutate(form, {
    onSuccess: () => { setForm(empty); toast({ title: "Cliente adicionado à lista de exclusão" }); },
    onError: (e) => toast({ title: "Não foi possível adicionar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Clientes desta lista não ganham cashback. Informe o e-mail ou o telefone (o mesmo cliente é reconhecido pelos dois).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Input placeholder="Telefone (com DDD)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <Input placeholder="Nome (opcional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input placeholder="Motivo (ex: funcionário)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </div>
      <Button onClick={submit} disabled={!canAdd || add.isPending} className="gap-2">
        {add.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} Adicionar à lista
      </Button>

      <div className="divide-y rounded-lg border">
        {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
        {!list.isLoading && (list.data?.length ?? 0) === 0 && <p className="p-4 text-sm text-muted-foreground">Ninguém na lista de exclusão.</p>}
        {list.data?.map((x) => (
          <div key={x.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{x.name || x.email || x.phone}</p>
              <p className="text-xs text-muted-foreground truncate">{[x.email, x.phone, x.reason].filter(Boolean).join(" • ")}</p>
            </div>
            <Button variant="ghost" size="sm" aria-label="Remover da lista" disabled={remove.isPending} onClick={() => remove.mutate(x.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
