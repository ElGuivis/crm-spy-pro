import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check } from "lucide-react";

interface FilterOptions {
  colors: string[];
  sizes: string[];
  productTypes: string[];
}

interface Props {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filterOptions: FilterOptions;
  colorFilter: string;
  onColorChange: (v: string) => void;
  sizeFilter: string;
  onSizeChange: (v: string) => void;
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  onlyInStock: boolean;
  onOnlyInStockChange: (v: boolean) => void;
  includePrice: boolean;
  onIncludePriceChange: (v: boolean) => void;
  filteredCount: number;
  selectedCount: number;
  onSelectAll: () => void;
}

export function CatalogPickerFilters({
  searchQuery, onSearchChange, filterOptions,
  colorFilter, onColorChange, sizeFilter, onSizeChange, categoryFilter, onCategoryChange,
  onlyInStock, onOnlyInStockChange, includePrice, onIncludePriceChange,
  filteredCount, selectedCount, onSelectAll,
}: Props) {
  return (
    <div className="px-4 pb-2 shrink-0 space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Buscar..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="pl-8 h-8 text-sm" />
        </div>
        {filterOptions.productTypes.length > 1 && (
          <Select value={categoryFilter} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {filterOptions.productTypes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterOptions.colors.length > 0 && (
          <Select value={colorFilter} onValueChange={onColorChange}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Cor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {filterOptions.colors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {filterOptions.sizes.length > 0 && (
          <Select value={sizeFilter} onValueChange={onSizeChange}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue placeholder="Tamanho" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {filterOptions.sizes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1.5">
          <Switch id="stock-picker" checked={onlyInStock} onCheckedChange={onOnlyInStockChange} className="scale-75" />
          <Label htmlFor="stock-picker" className="text-xs">Estoque</Label>
        </div>
        <Button variant="outline" size="sm" onClick={onSelectAll} className="h-7 text-xs px-2">
          <Check className="h-3 w-3 mr-1" />
          {selectedCount === filteredCount && filteredCount > 0 ? "Desmarcar" : "Todos"}
        </Button>
        <Badge variant="secondary" className="text-xs">{filteredCount}</Badge>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <Switch id="price-picker" checked={includePrice} onCheckedChange={onIncludePriceChange} className="scale-75" />
          <Label htmlFor="price-picker" className="text-xs">Preço</Label>
        </div>
      </div>
    </div>
  );
}
