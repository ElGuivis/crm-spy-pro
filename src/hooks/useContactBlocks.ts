import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/** Quem não recebe mensagens automáticas: pediu para sair pelo WhatsApp (SAIR) ou foi bloqueado pelo atendente. */
export interface ContactBlock {
  id: string;
  phone: string;
  name: string | null;
  source: "manual" | "optout";
  reason: string | null;
  message: string | null;
  createdAt: string;
}

const KEY = "contact-blocks";

/** Celular com e sem o nono dígito (igual a br_phone_key no banco), para achar o nome no cadastro de contatos. */
function variants(phone: string): string[] {
  const p = phone.replace(/\D/g, "");
  if (/^55\d{2}9\d{8}$/.test(p)) return [p, p.slice(0, 4) + p.slice(5)];
  if (/^55\d{2}[6-9]\d{7}$/.test(p)) return [p, p.slice(0, 4) + "9" + p.slice(4)];
  return [p];
}

export function useContactBlocks() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [KEY, tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ContactBlock[]> => {
      const { data, error } = await supabase
        .from("contact_blocks")
        .select("id, phone_e164, contact_name, source, reason, message_text, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = data ?? [];

      // Bloqueios antigos/manuais não guardam o nome: busca no cadastro de contatos pelo número.
      const missing = [...new Set(rows.filter((r) => !r.contact_name).flatMap((r) => variants(r.phone_e164)))];
      const names = new Map<string, string>();
      for (let i = 0; i < missing.length; i += 200) {
        const { data: contacts } = await supabase.from("contacts").select("phone, name")
          .eq("tenant_id", tenantId!).in("phone", missing.slice(i, i + 200));
        for (const c of contacts ?? []) if (c.name) names.set(c.phone, c.name);
      }

      return rows.map((r) => ({
        id: r.id,
        phone: r.phone_e164,
        name: r.contact_name || variants(r.phone_e164).map((v) => names.get(v)).find(Boolean) || null,
        source: r.source === "optout" ? "optout" : "manual",
        reason: r.reason,
        message: r.message_text,
        createdAt: r.created_at,
      }));
    },
  });
}

/** Tira da lista: a pessoa volta a receber as mensagens automáticas. */
export function useRemoveContactBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contact_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      toast.success("Contato removido da lista: volta a receber as mensagens automáticas");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível remover"),
  });
}
