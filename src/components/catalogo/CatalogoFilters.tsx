import { Card, CardContent } from "@/components/ui/card";
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
  filteredCount: number;
  selectedCount: number;
  onSelectAll: () => void;
}

export function CatalogoFilters({
  searchQuery, onSearchChange, filterOptions,
  colorFilter, onColorChange, sizeFilter, onSizeChange, categoryFilter, onCategoryChange,
  onlyInStock, onOnlyInStockChange, filteredCount, selectedCount, onSelectAll,
}: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou SKU..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
          </div>

          {filterOptions.colors.length > 0 && (
            <Select value={colorFilter} onValueChange={onColorChange}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Cor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as cores</SelectItem>
                {filterOptions.colors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {filterOptions.sizes.length > 0 && (
            <Select value={sizeFilter} onValueChange={onSizeChange}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tamanho" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tamanhos</SelectItem>
                {filterOptions.sizes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {filterOptions.productTypes.length > 1 && (
            <Select value={categoryFilter} onValueChange={onCategoryChange}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tipo de produto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {filterOptions.productTypes.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2">
            <Switch id="stock-filter" checked={onlyInStock} onCheckedChange={onOnlyInStockChange} />
            <Label htmlFor="stock-filter" className="text-sm">Somente com estoque</Label>
          </div>

          <Button variant="outline" size="sm" onClick={onSelectAll}>
            <Check className="h-4 w-4 mr-1" />
            {selectedCount === filteredCount && filteredCount > 0 ? "Desmarcar todos" : "Selecionar todos"}
          </Button>

          <Badge variant="secondary">{filteredCount} produtos</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
