import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogoState } from "@/hooks/useCatalogoProducts";
import { type CatalogSort, SORT_LABELS } from "./catalogFilters";

interface Props {
  c: CatalogoState;
  /** versão menor para o diálogo do atendimento */
  compact?: boolean;
  /** chaves extras na segunda linha (preço, juntar fotos) */
  extra?: ReactNode;
  idPrefix: string;
}

const ALL = "__all";

function FilterSelect({ value, onChange, placeholder, allLabel, options, className }: {
  value: string; onChange: (v: string) => void; placeholder: string; allLabel: string;
  options: { value: string; label: string }[]; className: string;
}) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
      <SelectTrigger className={cn(className, value && "border-primary text-primary")} aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Filtros do catálogo WhatsApp, usados na página do catálogo e no envio pelo atendimento. */
export function CatalogFilterControls({ c, compact, extra, idPrefix }: Props) {
  const { filters: f, setFilter, filterOptions: o } = c;
  const h = compact ? "h-8 text-xs" : "h-9 text-sm";
  const w = compact ? "w-[130px]" : "w-[160px]";
  const anyFilter = !!(f.search || f.type || f.color || f.size || !f.onlyInStock || f.includeOffSite);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className={cn("relative flex-1", compact ? "min-w-[160px]" : "min-w-[220px]")}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou SKU..." value={f.search} aria-label="Buscar produto"
            onChange={(e) => setFilter("search", e.target.value)} className={cn("pl-8", h)}
          />
        </div>
        {o.types.length > 1 && (
          <FilterSelect value={f.type} onChange={(v) => setFilter("type", v)} placeholder="Tipo" allLabel="Todos os tipos" className={cn(w, h)}
            options={o.types.map(t => ({ value: t.value, label: `${t.value} (${t.count})` }))} />
        )}
        {o.colors.length > 0 && (
          <FilterSelect value={f.color} onChange={(v) => setFilter("color", v)} placeholder="Cor" allLabel="Todas as cores" className={cn(w, h)}
            options={o.colors.map(v => ({ value: v, label: v }))} />
        )}
        {o.sizes.length > 0 && (
          <FilterSelect value={f.size} onChange={(v) => setFilter("size", v)} placeholder="Tamanho" allLabel="Todos os tamanhos" className={cn(compact ? "w-[110px]" : "w-[140px]", h)}
            options={o.sizes.map(v => ({ value: v, label: v }))} />
        )}
        <Select value={f.sort} onValueChange={(v) => setFilter("sort", v as CatalogSort)}>
          <SelectTrigger className={cn(compact ? "w-[130px]" : "w-[150px]", h)} aria-label="Ordenar"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as CatalogSort[]).map(k => <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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
