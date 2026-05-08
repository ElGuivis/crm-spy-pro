import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { createLogger } from '@/lib/logger';
const log = createLogger('useExport');

interface ExportOptions {
  filename: string;
  headers: string[];
  data: (string | number | null | undefined)[][];
  title?: string;
}

export function useExport() {
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
      downloadBlob(blob, `${filename}-${formatDate()}.csv`);

      toast({
        title: "Exportação concluída",
        description: `${data.length} registros exportados para CSV.`
      });
      return true;
    } catch (error) {
      log.error('CSV Export error:', error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os dados para CSV.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  const exportToPDF = async ({ filename, headers, data, title }: ExportOptions) => {
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
      const doc = new jsPDF({
        orientation: headers.length > 5 ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Add title
      if (title) {
        doc.setFontSize(16);
        doc.text(title, 14, 15);
      }

      // Add date
      doc.setFontSize(10);
      doc.setTextColor(128);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, title ? 22 : 15);

      // Add table
      autoTable(doc, {
        head: [headers],
        body: data.map(row => row.map(cell => (cell ?? '').toString())),
        startY: title ? 28 : 20,
        styles: {
          fontSize: 8,
          cellPadding: 2,
        },
        headStyles: {
          fillColor: [34, 197, 94], // Green color
          textColor: 255,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { top: 10 },
      });

      doc.save(`${filename}-${formatDate()}.pdf`);

      toast({
        title: "Exportação concluída",
        description: `${data.length} registros exportados para PDF.`
      });
      return true;
    } catch (error) {
      log.error('PDF Export error:', error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os dados para PDF.",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  return { exportToCSV, exportToPDF, isExporting };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDate() {
  return new Date().toISOString().split('T')[0];
}
