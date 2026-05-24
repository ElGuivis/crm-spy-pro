import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const getInitials = (name: string | null) => {
  if (!name) return '??';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
};

export const formatLastSync = (dateStr: string | null) => {
  if (!dateStr) return "Nunca";
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return "Nunca";
  }
};

export const getMostRecentSync = (int: {
  last_customers_sync_at?: string | null;
  last_sync_customers_at?: string | null;
  last_sync_at?: string | null;
} | null | undefined): string | null => {
  if (!int) return null;
  const dates = [int.last_customers_sync_at, int.last_sync_customers_at, int.last_sync_at].filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return dates.reduce((latest, current) => new Date(current) > new Date(latest) ? current : latest);
};

export const getPageNumbers = (currentPage: number, totalPages: number): (number | string)[] => {
  const pages: (number | string)[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }

  if (currentPage <= 3) {
    for (let i = 1; i <= 4; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  } else if (currentPage >= totalPages - 2) {
    pages.push(1);
    pages.push('...');
    for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push('...');
    for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
    pages.push('...');
    pages.push(totalPages);
  }

  return pages;
};

interface AddressGeral {
  municipio?: string;
  uf?: string;
}

/** Parses Bling-style endereco column (handles {geral: {...}} OR flat). */
export const parseBlingEnderecoGeral = (endereco: unknown): AddressGeral => {
  const e = endereco as Record<string, unknown> | null;
  if (!e) return {};
  return (e.geral || e) as AddressGeral;
};
