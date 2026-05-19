export interface BlingOrderFull {
  id: string;
  bling_id: number;
  numero: string;
  numero_loja: string | null;
  situacao_nome: string | null;
  situacao_id: number | null;
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  cliente_cpf_cnpj: string | null;
  valor_total: number | null;
  valor_produtos: number | null;
  valor_desconto: number | null;
  valor_frete: number | null;
  outras_despesas: number | null;
  data_criacao: string | null;
  data_saida: string | null;
  data_prevista: string | null;
  forma_pagamento: string | null;
  forma_envio: string | null;
  loja_nome: string | null;
  loja_id: number | null;
  observacoes: string | null;
  observacoes_internas: string | null;
  endereco_entrega: any;
  categoria_id: number | null;
  nota_fiscal_id: number | null;
  total_icms: number | null;
  total_ipi: number | null;
  vendedor_id: number | null;
  intermediador_cnpj: string | null;
  intermediador_nome_usuario: string | null;
  taxa_comissao: number | null;
  custo_frete: number | null;
  valor_base: number | null;
  frete_por_conta: number | null;
  quantidade_volumes: number | null;
  peso_bruto: number | null;
  prazo_entrega: number | null;
  transportador_id: number | null;
  transportador_nome: string | null;
  etiqueta: any;
  volumes: any[];
  parcelas: any[];
  numero_pedido_compra: string | null;
  integration_id: string;
}

export interface BlingOrderItem {
  id: string;
  produto_nome: string | null;
  sku: string | null;
  quantidade: number;
  valor_unitario: number | null;
  valor_total: number | null;
  desconto: number | null;
  unidade: string | null;
  aliquota_ipi: number | null;
  descricao_detalhada: string | null;
  comissao_base: number | null;
  comissao_aliquota: number | null;
  comissao_valor: number | null;
  preco_custo: number | null;
}

export interface BlingCustomer {
  id: string;
  bling_id: number;
  nome: string | null;
  data_nascimento: string | null;
  sexo: string | null;
  naturalidade: string | null;
  rg: string | null;
}

export interface BlingOrderDetailsDialogProps {
  order: BlingOrderFull | null;
  orderItems: BlingOrderItem[];
  loadingItems: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getStatusDisplayName?: (status: string | null, situacaoId: number | null) => string;
  getPaymentDisplayName?: (code: string | null) => string | null;
}
