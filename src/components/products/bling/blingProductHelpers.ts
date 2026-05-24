import { Tables } from "@/integrations/supabase/types";

export type BlingProduct = Tables<'bling_products'>;

export interface BlingImage { link: string; tipo?: string }

export interface BlingInlineVariation {
  id: number;
  nome: string;
  codigo?: string;
  preco?: number;
  estoque?: { saldoVirtualTotal?: number };
  imagemURL?: string;
}

export interface BlingWarehouseStock {
  id: number;
  nome: string;
  saldoVirtual?: number;
  saldoFisico?: number;
}

export const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const formatNumber = (value: number | null | undefined, suffix?: string) => {
  if (value === null || value === undefined) return '-';
  return `${value}${suffix || ''}`;
};

export const getCondicaoLabel = (condicao: number | null) => {
  switch (condicao) {
    case 1: return 'Novo';
    case 2: return 'Usado';
    default: return 'Não especificado';
  }
};

export const getOrigemLabel = (origem: number | null) => {
  switch (origem) {
    case 0: return 'Nacional';
    case 1: return 'Estrangeira (importação direta)';
    case 2: return 'Estrangeira (adquirida no mercado interno)';
    default: return origem?.toString() || '-';
  }
};

export const calcularMargem = (product: BlingProduct): string | null => {
  if (!product.preco || !product.preco_custo || product.preco_custo === 0) return null;
  const margem = ((product.preco - product.preco_custo) / product.preco_custo) * 100;
  return margem.toFixed(1);
};

export const parseImages = (raw: unknown): BlingImage[] | null => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as BlingImage[];
  return null;
};
