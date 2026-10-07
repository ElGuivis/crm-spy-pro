import { useEffect, useState } from "react";
import { Store, Loader2, Wand2, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { EMPTY_PROFILE, fetchCatalogSuggestion, useStoreProfile, type StoreProfileForm } from "@/hooks/useStoreProfile";
import { StoreProfilePolicies } from "./StoreProfilePolicies";

type TextField = Exclude<keyof StoreProfileForm, "policies">;

const TEXT_FIELDS: Array<{ key: TextField; label: string; hint: string; rows?: number }> = [
  { key: "about", label: "Sobre a loja", hint: "Quem vocês são, história, diferenciais", rows: 3 },
  { key: "sells", label: "O que vendemos", hint: "Tipos de produto, marcas, coleções", rows: 3 },
  { key: "does_not_sell", label: "O que NÃO vendemos", hint: "Evita a IA oferecer o que a loja não tem", rows: 2 },
  { key: "audience", label: "Público", hint: "Quem costuma comprar", rows: 2 },
  { key: "tone", label: "Tom de voz", hint: "Ex.: descontraído, usa gírias de rua, sem formalidade", rows: 2 },
  { key: "extra_rules", label: "Regras adicionais", hint: "Ex.: nunca prometer prazo; sempre oferecer o cupom X", rows: 3 },
];

/** Perfil do negócio do tenant: é o que a IA sabe sobre a loja (nunca mistura com outra loja). */
export function StoreProfileCard() {
  const { isAdmin } = useAuth();
  const { profile, isLoading, save } = useStoreProfile();
  const [form, setForm] = useState<StoreProfileForm>(EMPTY_PROFILE);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => { if (profile) setForm(profile); }, [profile]);

  const set = (key: TextField, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const setPolicy = (key: string, value: string) => setForm((f) => ({ ...f, policies: { ...f.policies, [key]: value } }));

  const suggest = async () => {
    setSuggesting(true);
    try {
      const text = await fetchCatalogSuggestion();
      if (!text) { toast.info("Nenhum produto importado para sugerir."); return; }
      setForm((f) => ({ ...f, sells: f.sells.trim() ? f.sells : text }));
      toast.success("Sugestão aplicada em “O que vendemos”. Revise e salve.");
    } catch (e) {
      toast.error(`Falha ao ler o catálogo: ${(e as Error).message}`);
    } finally {
      setSuggesting(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando perfil da loja...</p>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5 text-primary" />Perfil da loja</CardTitle>
        <CardDescription>
          É o que a IA sabe sobre a sua loja. Ela só afirma o que estiver aqui ou no catálogo; o que ficar em branco, ela diz que não sabe e chama um atendente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isAdmin && <p className="text-xs text-muted-foreground">Somente administradores podem editar o perfil.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="store-name">Nome da loja</Label>
            <Input id="store-name" maxLength={200} disabled={!isAdmin} value={form.store_name} onChange={(e) => set("store_name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="store-segment">Segmento</Label>
            <Input id="store-segment" maxLength={200} disabled={!isAdmin} placeholder="Ex.: Streetwear e acessórios" value={form.segment} onChange={(e) => set("segment", e.target.value)} />
          </div>
        </div>

        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`store-${f.key}`}>{f.label}</Label>
              {f.key === "sells" && isAdmin && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={suggest} disabled={suggesting}>
                  {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}Sugerir a partir do catálogo
                </Button>
              )}
            </div>
            <Textarea id={`store-${f.key}`} rows={f.rows ?? 3} maxLength={4000} disabled={!isAdmin} placeholder={f.hint} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        ))}

        <div className="space-y-2">
          <p className="text-sm font-medium">Políticas</p>
          <StoreProfilePolicies policies={form.policies} onChange={setPolicy} disabled={!isAdmin} />
        </div>

        {isAdmin && (
          <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar perfil
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
