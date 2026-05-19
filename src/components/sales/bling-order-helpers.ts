import { format, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";

export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  try {
    return differenceInYears(new Date(), new Date(birthDate));
  } catch {
    return null;
  }
}

export function formatBirthday(birthDate: string | null): string {
  if (!birthDate) return "-";
  try {
    return format(new Date(birthDate), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "-";
  }
}

export function getSexoLabel(sexo: string | null): string {
  if (!sexo) return "-";
  if (sexo === 'M') return "Masculino";
  if (sexo === 'F') return "Feminino";
  return sexo;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "R$ 0,00";
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    // Bling often sends only a DATE (no time). When it happens, backend stores it as midnight UTC.
    // If we format using local timezone (ex: Brazil), it may display as the previous day.
    const hasRealTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0;
    if (hasRealTime) {
      return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
    }
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "-";
  }
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getUTCFullYear());
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return "-";
  }
}

export function getStatusColor(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "secondary";
  const lowerStatus = status.toLowerCase();
  if (lowerStatus.includes("pago") || lowerStatus.includes("completo") || lowerStatus.includes("enviado") || lowerStatus.includes("atendido")) {
    return "default";
  }
  if (lowerStatus.includes("aguard") || lowerStatus.includes("pendent") || lowerStatus.includes("aberto")) {
    return "secondary";
  }
  if (lowerStatus.includes("cancel")) {
    return "destructive";
  }
  return "outline";
}

export function getFreteResponsavel(fretePorConta: number | null): string {
  if (fretePorConta === 0) return "Remetente (CIF)";
  if (fretePorConta === 1) return "Destinatário (FOB)";
  if (fretePorConta === 2) return "Terceiros";
  if (fretePorConta === 9) return "Sem frete";
  return "-";
}

export function displayValue(value: any): any {
  if (value === null || value === undefined || value === '') return "-";
  return value;
}
