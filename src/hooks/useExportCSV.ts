import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

import { createLogger } from '@/lib/logger';
const log = createLogger('useExportCSV');

interface ExportOptions {
  filename: string;
  headers: string[];
  data: (string | number | null | undefined)[][];
}

export function useExportCSV() {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const exportToCSV = async ({ filename, headers, data }: ExportOptions) => {
    if (data.length === 0) {
      toast({
        title: "Nenhum dado",
        description: "Não há dados para exportar.",
        variant: "destructive"
      });
      return false;
    }

    setIsExporting(true);
    try {
      const csvContent = [
        headers.join(';'),
        ...data.map(row => 
          row.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(';')
        )
      ].join('\n');

      // Add BOM for Excel UTF-8 compatibility
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Exportação concluída",
        description: `${data.length} registros exportados com sucesso.`
      });
      return true;
    } catch (error) {
      log.error('Export error:', error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os dados.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  return { exportToCSV, isExporting };
}