import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

/** Chaves das políticas guardadas em `tenant_business_profiles.policies` (iguais às lidas pelo ai-chat). */
export const POLICY_FIELDS = [
  { key: "shipping", label: "Frete e prazos", hint: "Ex.: envio em até 2 dias úteis; prazo por região; frete grátis acima de R$ X" },
  { key: "returns", label: "Trocas e devoluções", hint: "Prazo, condições, quem paga o frete da troca" },
  { key: "payment", label: "Formas de pagamento", hint: "Pix, cartão (parcelamento), boleto" },
  { key: "hours", label: "Horário de atendimento", hint: "Dias e horários" },
  { key: "wholesale", label: "Atacado e revenda", hint: "Como funciona, quantidade mínima, como pedir" },
  { key: "warranty", label: "Garantia", hint: "Prazo e o que cobre" },
  { key: "contact", label: "Contato", hint: "Telefone, e-mail, redes sociais" },
] as const;

export interface StoreProfileForm {
  store_name: string;
  segment: string;
  about: string;
  sells: string;
  does_not_sell: string;
  audience: string;
  tone: string;
  extra_rules: string;
  policies: Record<string, string>;
}

export const EMPTY_PROFILE: StoreProfileForm = {
  store_name: "", segment: "", about: "", sells: "", does_not_sell: "", audience: "", tone: "", extra_rules: "", policies: {},
};

const toText = (v: unknown) => (typeof v === "string" ? v : "");

function toPolicies(value: Json | null | undefined): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toText(v)]));
}

export function useStoreProfile() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["store-profile", tenantId];

  const { data: profile, isLoading } = useQuery({
    queryKey,
    enabled: !!tenantId,
    queryFn: async (): Promise<StoreProfileForm | null> => {
      const { data, error } = await supabase.from("tenant_business_profiles").select("*").eq("tenant_id", tenantId!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        store_name: toText(data.store_name), segment: toText(data.segment), about: toText(data.about), sells: toText(data.sells),
        does_not_sell: toText(data.does_not_sell), audience: toText(data.audience), tone: toText(data.tone),
        extra_rules: toText(data.extra_rules), policies: toPolicies(data.policies),
      };
    },
  });

  const save = useMutation({
    mutationFn: async (form: StoreProfileForm) => {
      if (!tenantId) throw new Error("Sem tenant");
      const clean = (s: string) => (s.trim() ? s.trim() : null);
      const policies = Object.fromEntries(Object.entries(form.policies).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
      const { error } = await supabase.from("tenant_business_profiles").upsert({
        tenant_id: tenantId, store_name: clean(form.store_name), segment: clean(form.segment), about: clean(form.about),
        sells: clean(form.sells), does_not_sell: clean(form.does_not_sell), audience: clean(form.audience), tone: clean(form.tone),
        extra_rules: clean(form.extra_rules), policies, updated_by: user?.id ?? null,
      }, { onConflict: "tenant_id" });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey }); toast.success("Perfil da loja salvo"); },
    onError: (e: Error) => toast.error(`Não foi possível salvar: ${e.message}`),
  });

  return { profile: profile ?? null, isLoading, save };
}

/** Texto "Camisetas (1182), Bonés (144)..." a partir do catálogo importado do tenant. */
export async function fetchCatalogSuggestion(): Promise<string> {
  const { data, error } = await supabase.rpc("get_catalog_summary");
  if (error) throw error;
  const summary = data as { total?: number; kinds?: Array<{ kind: string; count: number }> } | null;
  const kinds = (summary?.kinds ?? []).filter((k) => k.kind.length > 2).slice(0, 15);
  if (!kinds.length) return "";
  return kinds.map((k) => `${k.kind.charAt(0).toUpperCase()}${k.kind.slice(1)} (${k.count})`).join(", ");
}
