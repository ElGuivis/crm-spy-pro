import type { ChangelogEntry } from './types';

/** Março e abril de 2026. Mais recente primeiro. */
export const MARCH_CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.11.0',
    date: '15 Abr 2026',
    items: [
      { type: 'feature', text: 'Reativação de clientes inativos com ciclos de mensagens em etapas' },
      { type: 'feature', text: 'Acompanhamento das execuções de cada ciclo de reativação' },
    ],
  },
  {
    version: '2.10.0',
    date: '22 Mar 2026',
    items: [
      { type: 'feature', text: 'E-mail marketing: modelos, campanhas e envio agendado' },
      { type: 'feature', text: 'Métricas de abertura e clique por campanha' },
      { type: 'feature', text: 'Lista de supressão para quem pediu para não receber e-mails' },
      { type: 'feature', text: 'Cashback com configuração própria e cupons gerados automaticamente' },
    ],
  },
  {
    version: '2.9.0',
    date: '21 Mar 2026',
    items: [
      { type: 'feature', text: 'Convites para a equipe com link de aceite' },
      { type: 'improvement', text: 'Fila de falhas e proteção contra falhas em cadeia nas integrações' },
      { type: 'improvement', text: 'Métricas de funcionamento das rotinas internas' },
    ],
  },
  {
    version: '2.8.0',
    date: '15 Mar 2026',
    items: [
      { type: 'feature', text: 'Vários remetentes por integração de e-mail' },
    ],
  },
  {
    version: '2.7.0',
    date: '09 Mar 2026',
    items: [
      { type: 'feature', text: 'Campos personalizados nos contatos' },
      { type: 'feature', text: 'Segmentos do CRM para filtrar e reutilizar públicos' },
      { type: 'feature', text: 'Webhooks e chaves de API para integrar o SpyPro com outros sistemas' },
      { type: 'feature', text: 'White-label: personalização da marca' },
      { type: 'feature', text: 'Regras de roteamento das caixas de entrada' },
      { type: 'feature', text: 'Mesclar contatos duplicados' },
      { type: 'feature', text: 'Link de descadastro nos e-mails e etiquetas de cliente' },
    ],
  },
  {
    version: '2.6.0',
    date: '08 Mar 2026',
    items: [
      { type: 'feature', text: 'Sons customizáveis para notificações (Padrão, Chime, Pop, Sino)' },
      { type: 'feature', text: 'Tour de onboarding com dicas contextuais e navegação por teclado' },
      { type: 'feature', text: 'Botão de atualizar no checklist de setup' },
      { type: 'improvement', text: 'Animações de transição melhoradas no tour' },
      { type: 'improvement', text: 'Busca no changelog para encontrar novidades rapidamente' },
    ],
  },
  {
    version: '2.5.0',
    date: '08 Mar 2026',
    items: [
      { type: 'feature', text: 'Dashboard de Atendimento com P50/P90, SLA e volume por hora' },
      { type: 'feature', text: 'Export PDF e CSV em todos os relatórios' },
      { type: 'improvement', text: 'Gráficos Recharts nos relatórios de conversas' },
      { type: 'improvement', text: 'Performance por atendente com tempo de resposta' },
    ],
  },
  {
    version: '2.4.0',
    date: '07 Mar 2026',
    items: [
      { type: 'feature', text: 'Simulador de chatbot para teste de fluxos' },
      { type: 'feature', text: 'Wizard de automação com templates prontos' },
      { type: 'improvement', text: 'Preview de variáveis dinâmicas em automações' },
    ],
  },
  {
    version: '2.3.0',
    date: '06 Mar 2026',
    items: [
      { type: 'feature', text: 'Busca global de conversas (Ctrl+K)' },
      { type: 'feature', text: 'Filtros avançados por status, tag, agente e data' },
      { type: 'feature', text: 'Notas internas fixadas no painel do contato' },
      { type: 'improvement', text: 'Atalho Ctrl+Shift+N para notas rápidas' },
    ],
  },
  {
    version: '2.2.0',
    date: '05 Mar 2026',
    items: [
      { type: 'feature', text: 'Transições com Framer Motion entre páginas' },
      { type: 'feature', text: 'Skeleton loaders em todas as listagens' },
      { type: 'improvement', text: 'Cache inteligente com React Query' },
      { type: 'improvement', text: 'Lazy loading de rotas pesadas' },
      { type: 'fix', text: 'Performance mobile otimizada' },
    ],
  },
];
