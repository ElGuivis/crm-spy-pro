export interface StoreType {
  id: string;
  name: string;
  description: string;
  logo?: string;
  color: string;
  fields: { name: string; label: string; placeholder: string; type: string }[];
}

export const STORE_TYPES: StoreType[] = [
  {
    id: 'loja_integrada',
    name: 'Loja Integrada',
    description: 'Sincronização automática de pedidos, produtos e clientes',
    logo: 'https://static.lojaintegrada.com.br/img/logo-li.svg',
    color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    fields: [
      { name: 'api_key', label: 'API Key', placeholder: 'Sua chave de API', type: 'password' }
    ]
  },
  {
    id: 'bling',
    name: 'Bling',
    description: 'ERP completo para e-commerce',
    color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    fields: [
      { name: 'api_key', label: 'API Key', placeholder: 'Sua chave de API do Bling', type: 'password' }
    ]
  },
  {
    id: 'nuvemshop',
    name: 'Nuvem Shop',
    description: 'Plataforma de e-commerce completa',
    color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    fields: [
      { name: 'api_key', label: 'Access Token', placeholder: 'Seu access token', type: 'password' }
    ]
  }
];

export interface ExistingIntegration {
  id: string;
  name: string;
  type: string;
  status: string;
  ordersCount?: number;
}

export function getStoreColor(type: string): string {
  return STORE_TYPES.find(s => s.id === type)?.color || 'bg-muted text-muted-foreground';
}

export function getStoreLogo(type: string): string | undefined {
  return STORE_TYPES.find(s => s.id === type)?.logo;
}
