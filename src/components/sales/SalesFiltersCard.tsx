import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Filter, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SalesFiltersCardProps {
  statusFilter: string;
  dateFilter: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  availableStatuses: string[];
  showFilters: boolean;
  onStatusChange: (v: string) => void;
  onDateFilterChange: (v: string) => void;
  onDateFromChange: (d: Date | undefined) => void;
  onDateToChange: (d: Date | undefined) => void;
  onToggleFilters: () => void;
  onClearFilters: () => void;
}

export function SalesFiltersCard({
  statusFilter, dateFilter, dateFrom, dateTo, availableStatuses, showFilters,
  onStatusChange, onDateFilterChange, onDateFromChange, onDateToChange, onToggleFilters, onClearFilters,
}: SalesFiltersCardProps) {
  const hasActiveFilter = statusFilter !== 'all' || dateFilter !== 'all';

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onToggleFilters} className="gap-2">
              <Filter className="h-4 w-4" />
              Filtros
              {hasActiveFilter && <Badge variant="secondary" className="ml-1 text-xs">Ativo</Badge>}
            </Button>
            {hasActiveFilter && (
              <Button variant="ghost" size="sm" onClick={onClearFilters}>
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </div>
          {showFilters && (
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
              <div className="space-y-1 flex-1">
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <Select value={statusFilter} onValueChange={onStatusChange}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {availableStatuses.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1">
                <label className="text-xs font-medium text-muted-foreground">Período</label>
                <Select value={dateFilter} onValueChange={(v) => { onDateFilterChange(v); if (v !== 'custom') { onDateFromChange(undefined); onDateToChange(undefined); } }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todo período</SelectItem>
                    <SelectItem value="7d">Últimos 7 dias</SelectItem>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {dateFilter === 'custom' && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">De</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-full sm:w-[140px] justify-start text-left font-normal text-sm">
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Início"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateFrom} onSelect={onDateFromChange} locale={ptBR} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Até</label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-full sm:w-[140px] justify-start text-left font-normal text-sm">
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {dateTo ? format(dateTo, "dd/MM/yyyy") : "Fim"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dateTo} onSelect={onDateToChange} locale={ptBR} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
