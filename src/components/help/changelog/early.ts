import type { ChangelogEntry } from './types';

/** Do lançamento (dez/2025) até o módulo do Instagram (mar/2026). Mais recente primeiro. */
export const EARLY_CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.1.0',
    date: '01 Mar 2026',
    items: [
      { type: 'feature', text: 'Novo módulo do Instagram: canais, conversas, contatos, etiquetas e fila de envio' },
      { type: 'feature', text: 'Registro de eventos e entregas de webhook do Instagram para acompanhar o que chegou' },
      { type: 'improvement', text: 'Capacidades de cada canal do Instagram detectadas automaticamente' },
    ],
  },
  {
    version: '2.0.0',
    date: '21 Fev 2026',
    items: [
      { type: 'feature', text: 'Segmentação RFM de clientes (Recência, Frequência e Valor) com histórico por categoria' },
      { type: 'feature', text: 'Públicos RFM para usar em campanhas' },
      { type: 'feature', text: 'Alertas de RFM quando clientes mudam de categoria' },
    ],
  },
  {
    version: '1.9.0',
    date: '17 Fev 2026',
    items: [
      { type: 'feature', text: 'WhatsApp via Evolution API: canais, caixas de entrada e fila de envio' },
      { type: 'feature', text: 'Etiquetas (tags) nas conversas' },
      { type: 'feature', text: 'Bloqueio de contatos' },
      { type: 'feature', text: 'Histórico de eventos de cada conversa' },
    ],
  },
  {
    version: '1.8.0',
    date: '16 Fev 2026',
    items: [
      { type: 'feature', text: 'Mensagens de aniversário automáticas com cupom' },
      { type: 'feature', text: 'Campanhas em massa por WhatsApp com lista de contatos' },
    ],
  },
  {
    version: '1.7.0',
    date: '14 Fev 2026',
    items: [
      { type: 'improvement', text: 'Sincronização da Loja Integrada reescrita, com progresso salvo e retomada automática' },
      { type: 'improvement', text: 'Webhooks da Loja Integrada para atualizar pedidos, clientes e produtos em tempo real' },
    ],
  },
  {
    version: '1.6.0',
    date: '21 Jan 2026',
    items: [
      { type: 'feature', text: 'Sincronização automática dos envios do Melhor Envio' },
      { type: 'feature', text: 'Mapeamento de códigos do Bling' },
      { type: 'feature', text: 'Situações dos pedidos do Bling' },
    ],
  },
  {
    version: '1.5.0',
    date: '05 Jan 2026',
    items: [
      { type: 'feature', text: 'Integração com o Bling: pedidos, clientes e produtos' },
      { type: 'feature', text: 'Webhooks do Bling para atualização automática' },
      { type: 'feature', text: 'WhatsApp oficial (Meta): conversas, mensagens e modelos de mensagem' },
      { type: 'feature', text: 'Comentários do Instagram na caixa de entrada' },
      { type: 'feature', text: 'Captura de leads' },
    ],
  },
  {
    version: '1.4.0',
    date: '03 Jan 2026',
    items: [
      { type: 'feature', text: 'Integração com o Melhor Envio: envios e rastreio' },
      { type: 'feature', text: 'Conexão de contas Meta e Instagram (primeira versão)' },
      { type: 'improvement', text: 'Sincronização de envios em segundo plano' },
    ],
  },
  {
    version: '1.3.0',
    date: '01 Jan 2026',
    items: [
      { type: 'feature', text: 'Fila de mensagens com horário comercial' },
      { type: 'feature', text: 'Respostas rápidas e mensagens automáticas' },
      { type: 'feature', text: 'Notificações de pedido por status, com regras de envio' },
      { type: 'feature', text: 'Recuperação de carrinho abandonado (descontinuada em maio de 2026)' },
    ],
  },
  {
    version: '1.2.0',
    date: '31 Dez 2025',
    items: [
      { type: 'feature', text: 'Atendimento: contatos, conversas e mensagens' },
      { type: 'feature', text: 'Quadro Kanban para organizar conversas por coluna' },
      { type: 'feature', text: 'Agentes de IA para atendimento, com credenciais de IA próprias' },
      { type: 'feature', text: 'Controle de consumo de IA' },
      { type: 'feature', text: 'Configurações de notificação' },
    ],
  },
  {
    version: '1.1.0',
    date: '27 Dez 2025',
    items: [
      { type: 'feature', text: 'Equipes com permissões por módulo' },
      { type: 'feature', text: 'Planos de tokens, saldo e extrato de uso' },
      { type: 'feature', text: 'Integração de e-mail por SMTP' },
      { type: 'feature', text: 'Cashback com lembretes' },
    ],
  },
  {
    version: '1.0.0',
    date: '25 Dez 2025',
    items: [
      { type: 'feature', text: 'Lançamento do SpyPro' },
      { type: 'feature', text: 'Integração com a Loja Integrada: clientes, produtos e pedidos' },
      { type: 'feature', text: 'Sincronização com histórico e acompanhamento de execuções' },
    ],
  },
];
