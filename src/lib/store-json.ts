/** Formas dos campos jsonb das tabelas da Loja Integrada / Bling (o banco os entrega como `Json`). */
export interface LiAddress {
  endereco?: string; numero?: string; bairro?: string; cidade?: string; estado?: string; cep?: string;
  complemento?: string; principal?: boolean;
}
export interface LiCustomerRaw {
  data_nascimento?: string; sexo?: string; tipo?: string; aceita_newsletter?: boolean; data_criacao?: string;
  enderecos?: LiAddress[];
}
export interface LiTotals { total?: number; subtotal?: number; frete?: number; desconto?: number }
export interface BlingAddress {
  endereco?: string; numero?: string; bairro?: string; municipio?: string; uf?: string; cep?: string;
}

/** Pedido da Loja Integrada (colunas jsonb de `li_orders`). */
export interface LiCliente { nome?: string; email?: string; telefone_celular?: string; telefone_principal?: string; cpf?: string; cnpj?: string }
export interface LiOrderRaw {
  cliente?: LiCliente | string;
  cliente_nome?: string; cliente_email?: string; cliente_telefone?: string; cliente_cpf_cnpj?: string;
  cupom_desconto?: string; observacoes?: string;
}
export interface LiOrderTotals { subtotal?: number; discount?: number; shipping?: number; total?: number }
export interface LiOrderPayment {
  method?: string; type?: string; installments?: number; brand?: string; gateway?: string;
  transaction_id?: string; data_pagamento?: string; all_payments?: unknown;
}
export interface LiShippingAddress {
  logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; estado?: string; cep?: string;
}
export interface LiOrderShipping {
  method?: string; tracking_code?: string; tracking_url?: string; data_envio?: string;
  nome_destinatario?: string; telefone_destinatario?: string; address?: LiShippingAddress;
  peso_real?: number; all_envios?: unknown;
}

/** Pedido do Bling (colunas jsonb de `bling_orders`). */
export interface BlingDeliveryAddress {
  endereco?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string;
  cidade?: string; uf?: string; cep?: string;
}
export interface BlingVolume { id?: string | number; codigoRastreamento?: string; servico?: string }
export interface BlingParcela {
  valor?: number; dataVencimento?: string; observacao?: string; observacoes?: string;
  formaPagamento?: { id?: number | string; descricao?: string };
}
