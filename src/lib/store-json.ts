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
