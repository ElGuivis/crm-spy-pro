import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Copy, Clock, Package, Truck, CheckCircle2, XCircle, AlertCircle, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  posted: { label: "Postado", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", icon: Package },
  in_transit: { label: "Em Trânsito", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", icon: Truck },
  delivered: { label: "Entregue", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  canceled: { label: "Cancelado", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
  expired: { label: "Expirado", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400", icon: AlertCircle },
  returning: { label: "Retornando", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", icon: RotateCcw },
  returned: { label: "Devolvido", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400", icon: RotateCcw },
};

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try { return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
  catch { return "-"; }
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function getStatusBadge(status: string | null) {
  const cfg = statusConfig[status || "pending"] || statusConfig.pending;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.color} gap-1 text-sm px-3 py-1`}>
      <Icon className="h-4 w-4" />{cfg.label}
    </Badge>
  );
}

interface CopyButtonProps {
  text: string;
  fieldName: string;
  copiedField: string | null;
  onCopy: (text: string, fieldName: string) => void;
}

export function CopyButton({ text, fieldName, copiedField, onCopy }: CopyButtonProps) {
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onCopy(text, fieldName)}>
      {copiedField === fieldName ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}
