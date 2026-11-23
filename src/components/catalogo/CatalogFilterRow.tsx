import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { type CatalogFilterOptions, type CatalogFilterState, type CatalogSort, SORT_LABELS } from "./catalogFilters";

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

interface Props {
  filters: CatalogFilterState;
  setFilter: <K extends keyof CatalogFilterState>(key: K, value: CatalogFilterState[K]) => void;
  options: CatalogFilterOptions;
  compact?: boolean;
}

/** Busca + tipo + cor + tamanho + ordenação: a mesma linha no Catálogo WhatsApp, no atendimento e em Produtos. */
export function CatalogFilterRow({ filters: f, setFilter, options: o, compact }: Props) {
  const h = compact ? "h-8 text-xs" : "h-9 text-sm";
  const w = compact ? "w-[130px]" : "w-[160px]";
  return (
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
  );
}
