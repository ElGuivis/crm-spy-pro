import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import type { CampaignFormData } from "@/hooks/useEmailCampaignForm";

const WINDOWS = [1, 3, 7, 14, 30];

/** Cupons da campanha + janela de atribuição: base para medir compras vindas do e-mail. */
export function CampaignAttributionFields({ form }: { form: UseFormReturn<CampaignFormData> }) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">Medir compras desta campanha</p>
        <p className="text-xs text-muted-foreground">
          Cliques e aberturas já são rastreados sozinhos. Informe os cupons para contar também quem comprou com o código sem clicar no e-mail.
        </p>
      </div>

      <FormField control={form.control} name="coupon_codes" render={({ field }) => {
        const codes = field.value ?? [];
        const add = (raw: string) => {
          const parts = raw.split(/[,\s;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
          if (parts.length === 0) return;
          field.onChange(Array.from(new Set([...codes, ...parts])));
          setDraft("");
        };
        return (
          <FormItem>
            <FormLabel>Cupons da campanha (opcional)</FormLabel>
            <FormControl>
              <Input
                placeholder="Ex: BLACK10 — Enter para adicionar"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } }}
                onBlur={() => add(draft)}
              />
            </FormControl>
            {codes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {codes.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-1 font-mono">
                    {c}
                    <button type="button" aria-label={`Remover ${c}`} onClick={() => field.onChange(codes.filter((x) => x !== c))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <FormDescription>Use um cupom exclusivo da campanha. Um cupom usado em várias campanhas ao mesmo tempo é creditado a uma só.</FormDescription>
          </FormItem>
        );
      }} />

      <FormField control={form.control} name="attribution_window_days" render={({ field }) => (
        <FormItem>
          <FormLabel>Janela de atribuição</FormLabel>
          <Select value={String(field.value ?? 7)} onValueChange={(v) => field.onChange(Number(v))}>
            <FormControl><SelectTrigger className="w-48"><SelectValue /></SelectTrigger></FormControl>
            <SelectContent>
              {WINDOWS.map((d) => <SelectItem key={d} value={String(d)}>{d === 1 ? "1 dia" : `${d} dias`}</SelectItem>)}
            </SelectContent>
          </Select>
          <FormDescription>Compras feitas até este prazo depois do clique, da abertura ou do envio (cupom) contam para a campanha.</FormDescription>
        </FormItem>
      )} />
    </div>
  );
}
