import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CampaignFormData } from "@/hooks/useEmailCampaignForm";

const OPTIONS = [
  { value: 0, label: "Não (enviar para todos da lista)" },
  { value: 3, label: "Sim, se recebeu nos últimos 3 dias" },
  { value: 7, label: "Sim, se recebeu nos últimos 7 dias" },
  { value: 15, label: "Sim, se recebeu nos últimos 15 dias" },
  { value: 30, label: "Sim, se recebeu nos últimos 30 dias" },
];

/** Proteção contra excesso de e-mail: pular quem já recebeu e-mail recentemente (evita cansar o cliente e queixas de spam). */
export function CampaignSafetyFields({ form }: { form: UseFormReturn<CampaignFormData> }) {
  return (
    <FormField control={form.control} name="skip_recent_days" render={({ field }) => (
      <FormItem>
        <FormLabel>Pular quem já recebeu e-mail recentemente</FormLabel>
        <Select value={String(field.value ?? 0)} onValueChange={(v) => field.onChange(Number(v))}>
          <FormControl><SelectTrigger className="w-80"><SelectValue /></SelectTrigger></FormControl>
          <SelectContent>
            {OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <FormDescription>Conta qualquer campanha enviada por você. Quem for pulado não aparece na fila nem nas métricas desta campanha.</FormDescription>
      </FormItem>
    )} />
  );
}
