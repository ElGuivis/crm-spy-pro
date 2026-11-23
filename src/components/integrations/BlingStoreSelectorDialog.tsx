import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Store, RefreshCw, Hand } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { createLogger } from "@/lib/logger";

const log = createLogger("BlingStoreSelectorDialog");

/** Canais de venda do Bling (PDV, e-commerce, marketplace). O id 0 = pedidos sem canal. */
const NO_CHANNEL = 0;

interface BlingStore { id: number; name: string; type: string; active?: boolean }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  /** Chamado depois de salvar. `storeIds` null = todos os canais. */
  onConfirm?: (storeIds: number[] | null) => void;
  confirmLabel?: string;
  title?: string;
  description?: string;
}

const TYPE_LABEL: Record<string, string> = {
  LojaFisica: "Loja física (PDV)", LojaIntegrada: "Loja Integrada", Nuvemshop: "Nuvemshop",
  TikTok: "TikTok Shop", MercadoLivre: "Mercado Livre", Shopee: "Shopee", Amazon: "Amazon",
};

export function BlingStoreSelectorDialog({
  open, onOpenChange, integrationId, onConfirm,
  confirmLabel = "Salvar e sincronizar",
  title = "De onde puxar do Bling",
  description = "Escolha os canais de venda do Bling que são desta loja. Pedidos de outros canais ficam de fora.",
}: Props) {
  const [stores, setStores] = useState<BlingStore[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [productStore, setProductStore] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [storesRes, intRes] = await Promise.all([
        supabase.functions.invoke("bling-stores", { body: { integrationId } }),
        supabase.from("integrations").select("bling_store_ids, bling_product_store_id").eq("id", integrationId).maybeSingle(),
      ]);
      if (storesRes.error) log.error("Error fetching Bling stores:", storesRes.error);
      const list = ((storesRes.data?.stores ?? []) as BlingStore[])
        .slice().sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || a.name.localeCompare(b.name));
      setStores(list);
      setSelected(intRes.data?.bling_store_ids ?? []);
      setProductStore(intRes.data?.bling_product_store_id ? String(intRes.data.bling_product_store_id) : "all");
    } catch (err) {
      log.error("Error loading channels:", err);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [integrationId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleConfirm = async () => {
    const storeIds = selected.length ? selected : null;
    const productStoreId = productStore === "all" ? null : Number(productStore);
    setSaving(true);
    const { error } = await supabase.from("integrations")
      .update({ bling_store_ids: storeIds, bling_product_store_id: productStoreId })
      .eq("id", integrationId);
    setSaving(false);
    if (error) {
      log.error("Error saving channels:", error);
      toast.error("Não foi possível salvar os canais");
      return;
    }
    toast.success(storeIds ? `${storeIds.length} canal(is) escolhido(s)` : "Todos os canais do Bling");
    onConfirm?.(storeIds);
    onOpenChange(false);
  };

  const row = (id: number, name: string, hint: string, icon: JSX.Element, muted = false) => (
    <label
      key={id}
      htmlFor={`ch-${id}`}
      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
        selected.includes(id) ? "bg-primary/5 border-primary" : "hover:bg-muted/50"
      } ${muted ? "opacity-60" : ""}`}
    >
      <Checkbox id={`ch-${id}`} checked={selected.includes(id)} onCheckedChange={() => toggle(id)} />
      {icon}
      <span className="flex-1 text-sm">{name}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );

  const productChannels = stores.filter((s) => s.type !== "LojaFisica");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Store className="h-5 w-5" />{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Pedidos</h3>
          {loading ? (
            <><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></>
          ) : stores.length === 0 ? (
            <div className="text-center py-3 text-sm text-muted-foreground">
              Não consegui ler os canais do Bling.
              <Button variant="ghost" size="sm" onClick={load} className="ml-2"><RefreshCw className="h-4 w-4 mr-1" />Tentar de novo</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {stores.map((s) =>
                row(s.id, s.name, `${TYPE_LABEL[s.type] ?? s.type}${s.active === false ? " · inativo" : ""}`,
                  <Store className="h-4 w-4 text-muted-foreground" />, s.active === false))}
              {row(NO_CHANNEL, "Pedidos sem canal", "lançados à mão no Bling", <Hand className="h-4 w-4 text-muted-foreground" />)}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {selected.length === 0
              ? "Nada marcado = puxa os pedidos de TODOS os canais (inclusive de outras marcas que usam este Bling)."
              : `${selected.length} marcado(s). Só os pedidos desses canais entram, inclusive os avisos automáticos do Bling.`}
          </p>
        </section>

        <section className="space-y-2 pt-2">
          <h3 className="text-sm font-medium">Produtos</h3>
          <RadioGroup value={productStore} onValueChange={setProductStore} className="space-y-1">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <RadioGroupItem value="all" id="prod-all" />Todos os produtos do Bling
            </label>
            {productChannels.map((s) => (
              <label key={s.id} className="flex items-center gap-3 text-sm cursor-pointer">
                <RadioGroupItem value={String(s.id)} id={`prod-${s.id}`} />
                Só os vinculados a {s.name}
              </label>
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            A loja física (PDV) não tem produtos vinculados no Bling; para ela, use os de um canal de e-commerce ou todos.
          </p>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={loading || saving}>
            <RefreshCw className={`h-4 w-4 mr-2 ${saving ? "animate-spin" : ""}`} />{confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
