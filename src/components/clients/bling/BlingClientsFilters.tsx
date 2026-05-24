import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

interface Props {
  searchTerm: string;
  pageSize: number;
  onSearch: (value: string) => void;
  onPageSizeChange: (value: string) => void;
}

export function BlingClientsFilters({ searchTerm, pageSize, onSearch, onPageSizeChange }: Props) {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="relative flex-1 min-w-64">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nome, email, telefone, CPF/CNPJ..."
          value={searchTerm}
          onChange={(e) => onSearch(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>
      <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="15">15 por página</SelectItem>
          <SelectItem value="30">30 por página</SelectItem>
          <SelectItem value="50">50 por página</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
