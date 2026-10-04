import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildProductUrl, useStoreBaseUrl } from "@/hooks/useStoreBaseUrl";
import { hdImageUrl } from "@/lib/product-images";
import type { EmailBlock, ProductBlock } from "./types";

type Mode = "bestsellers" | "newest" | "promo";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "bestsellers", label: "Mais vendidos", hint: "Os produtos que mais saíram no período escolhido." },
  { value: "newest", label: "Lançamentos", hint: "Os produtos cadastrados mais recentemente." },
  { value: "promo", label: "Em promoção", hint: "Produtos com preço promocional menor que o preço cheio." },
];
const brl = (v: number | null) => (v ? `R$ ${v.toFixed(2).replace(".", ",")}` : "");

interface Props { onInsert: (blocks: EmailBlock[]) => void }

/** Monta uma vitrine (grade de produtos) com os produtos da loja por critério. Os dados valem no momento da criação: o e-mail enviado é fixo. */
export function ShowcaseDialog({ onInsert }: Props) {
  const { baseUrl } = useStoreBaseUrl();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("bestsellers");
  const [count, setCount] = useState("6");
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);

  const build = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_li_showcase_products", { p_mode: mode, p_limit: Number(count), p_days: Number(days) });
      if (error) throw error;
      if (!data?.length) {
        toast.error(mode === "bestsellers" ? "Nenhuma venda nesse período. Tente um período maior." : "Nenhum produto encontrado com esse critério.");
        return;
      }
      const cards: ProductBlock[] = data.map((p) => {
        const onSale = p.promotional_price && p.promotional_price > 0 && p.promotional_price < p.price;
        return {
          type: "product", imageUrl: p.image_path ? `https://cdn.awsli.com.br/${p.image_path}` : hdImageUrl(p.image_large || p.image_url) || "",
          name: p.name, description: "", price: brl(onSale ? p.promotional_price : p.price), oldPrice: onSale ? brl(p.price) : undefined,
          buttonText: "Ver produto", buttonUrl: buildProductUrl(baseUrl, p.url), alignment: "center", padding: "10px",
          buttonColor: "#111111", buttonTextColor: "#ffffff",
        };
      });
      // 3 por linha (a última linha pode ter 1 ou 2; colunas vazias seguram a largura)
      const rows: EmailBlock[] = [];
      for (let i = 0; i < cards.length; i += 3) {
        const [a, b, c] = [cards[i], cards[i + 1], cards[i + 2]];
        rows.push({ type: "columns-3", columnGap: "10px", padding: "6px 14px", column1: [a], column2: b ? [b] : [], column3: c ? [c] : [] });
      }
      onInsert(rows);
      setOpen(false);
      toast.success(`Vitrine com ${cards.length} produto(s) adicionada`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível montar a vitrine");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2"><ShoppingBag className="h-4 w-4" />Vitrine</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vitrine automática</DialogTitle>
          <DialogDescription>Monta uma grade com produtos da loja, já com imagem, preço e link. Depois você pode editar cada produto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Quais produtos</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["3", "6", "9", "12"].map((n) => <SelectItem key={n} value={n}>{n} produtos</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {mode === "bestsellers" && (
              <div className="space-y-1.5">
                <Label>Período de vendas</Label>
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                    <SelectItem value="180">Últimos 6 meses</SelectItem>
                    <SelectItem value="365">Último ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" onClick={build} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Adicionar ao e-mail</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
