import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogoState } from "@/hooks/useCatalogoProducts";
import { CatalogFilterRow } from "./CatalogFilterRow";

interface Props {
  c: CatalogoState;
  /** versão menor para o diálogo do atendimento */
  compact?: boolean;
  /** chaves extras na segunda linha (preço, juntar fotos) */
  extra?: ReactNode;
  idPrefix: string;
}

/** Filtros do catálogo WhatsApp, usados na página do catálogo e no envio pelo atendimento. */
export function CatalogFilterControls({ c, compact, extra, idPrefix }: Props) {
  const { filters: f, setFilter, filterOptions: o } = c;
  const anyFilter = !!(f.search || f.type || f.color || f.size || !f.onlyInStock || f.includeOffSite);

  return (
    <div className="space-y-2">
      <CatalogFilterRow filters={f} setFilter={setFilter} options={o} compact={compact} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Switch id={`${idPrefix}-stock`} checked={f.onlyInStock} onCheckedChange={(v) => setFilter("onlyInStock", v)} className={compact ? "scale-75" : ""} />
          <Label htmlFor={`${idPrefix}-stock`} className={compact ? "text-xs" : "text-sm"}>Só com estoque</Label>
        </div>
        {(c.offSiteCount > 0 || f.includeOffSite) && (
          <div className="flex items-center gap-1.5">
            <Switch id={`${idPrefix}-offsite`} checked={f.includeOffSite} onCheckedChange={(v) => setFilter("includeOffSite", v)} className={compact ? "scale-75" : ""} />
            <Label htmlFor={`${idPrefix}-offsite`} className={compact ? "text-xs" : "text-sm"} title="Produtos desativados na loja (não aparecem no site) que ainda têm estoque">
              Incluir fora do site ({c.offSiteCount})
            </Label>
          </div>
        )}
        {extra}
        <div className="ml-auto flex items-center gap-2">
          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={c.resetFilters} className="h-7 text-xs px-2">
              <X className="h-3 w-3 mr-1" />Limpar filtros
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={c.selectAll} disabled={c.filtered.length === 0} className="h-7 text-xs px-2">
            <Check className="h-3 w-3 mr-1" />
            {c.allFilteredSelected ? "Desmarcar visíveis" : "Marcar visíveis"}
          </Button>
          <Badge variant="secondary" className="text-xs">{c.filtered.length} produto{c.filtered.length === 1 ? "" : "s"}</Badge>
        </div>
      </div>

      {c.hiddenWithoutPhoto > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {c.hiddenWithoutPhoto} produto{c.hiddenWithoutPhoto > 1 ? "s" : ""} com estoque não aparece{c.hiddenWithoutPhoto > 1 ? "m" : ""} por não ter foto na loja (o catálogo é enviado como imagem).
        </p>
      )}
    </div>
  );
}
