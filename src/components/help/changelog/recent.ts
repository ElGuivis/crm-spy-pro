import type { ChangelogEntry } from './types';

/** De maio a outubro de 2026. Mais recente primeiro. */
export const RECENT_CHANGELOG: ChangelogEntry[] = [
  {
    version: '4.0.0',
    date: '03 Out 2026',
    items: [
      { type: 'feature', text: 'Loja Integrada conectada por Personal Token, a nova forma de autenticação da plataforma (válido por 3 meses)' },
      { type: 'feature', text: 'Acesso somente por convite: o cadastro público foi fechado' },
      { type: 'improvement', text: 'Infraestrutura própria do SpyPro, com backups diários criptografados' },
      { type: 'improvement', text: 'Isolamento entre contas reforçado: cada empresa acessa apenas os próprios dados' },
      { type: 'improvement', text: 'Webhooks do Melhor Envio e do WhatsApp protegidos por token' },
      { type: 'improvement', text: 'Proteções de segurança reforçadas no site e nas rotinas internas' },
      { type: 'fix', text: 'Exclusão de integração voltou a funcionar (antes retornava erro)' },
      { type: 'fix', text: 'Sincronização contínua de pedidos da Loja Integrada corrigida' },
      { type: 'fix', text: 'Acentuação corrigida nas mensagens padrão de aniversário, cashback, reativação e recepção' },
      { type: 'fix', text: 'Imagens dos e-mails deixaram de poder ser listadas por terceiros; os links continuam funcionando' },
    ],
  },
  {
    version: '3.6.1',
    date: '03 Jun 2026',
    items: [
      { type: 'fix', text: 'Passo do WhatsApp no onboarding agora conta como concluído para canais Evolution API' },
      { type: 'fix', text: 'Fontes do Google liberadas na política de segurança do site' },
      { type: 'improvement', text: 'Limpeza automática do histórico das rotinas internas' },
    ],
  },
  {
    version: '3.6.0',
    date: '27 Mai 2026',
    items: [
      { type: 'feature', text: 'LGPD: logs operacionais com mais de 90 dias são apagados automaticamente' },
      { type: 'improvement', text: 'Cabeçalhos de segurança no site e validação do endereço de retorno nas conexões' },
      { type: 'improvement', text: 'Telas e rotinas divididas em módulos menores, para mais estabilidade' },
      { type: 'fix', text: 'Link de rastreio de e-mail não redireciona mais para endereços externos indevidos' },
    ],
  },
  {
    version: '3.5.0',
    date: '24 Mai 2026',
    items: [
      { type: 'feature', text: 'Aviso por WhatsApp quando o cliente ganha ou resgata pontos de fidelidade' },
      { type: 'feature', text: 'Fluxos do chatbot disparados pelo WhatsApp, com palavras-gatilho e sessões ativas' },
      { type: 'improvement', text: 'Regras de gatilho do Instagram ligadas explicitamente à integração escolhida' },
      { type: 'fix', text: 'Menu da recepcionista e proteção contra loops no WhatsApp restaurados' },
      { type: 'fix', text: 'Arquivos de campanha com acesso restrito a cada empresa' },
    ],
  },
  {
    version: '3.4.1',
    date: '22 Mai 2026',
    items: [
      { type: 'improvement', text: 'Revisão de segurança e de desempenho em consultas de tabelas grandes' },
      { type: 'fix', text: 'Editor de agentes de IA mantém o estado correto ao trocar de agente' },
      { type: 'fix', text: 'Formulário de campanha de e-mail não indica alterações que não existem' },
      { type: 'fix', text: 'Tipo de integração da Nuvemshop corrigido' },
      { type: 'fix', text: 'Várias correções de estabilidade encontradas em revisões gerais' },
    ],
  },
  {
    version: '3.4.0',
    date: '20 Mai 2026',
    items: [
      { type: 'feature', text: 'Previsão de LTV e probabilidade de churn por cliente' },
      { type: 'feature', text: 'Classificação de intenção e triagem por sentimento na conversa' },
      { type: 'feature', text: 'Campanhas inteligentes: teste A/B de e-mail e WhatsApp, melhor horário de envio e anti-churn automático' },
      { type: 'feature', text: 'Relatórios avançados e atribuição de receita por campanha' },
    ],
  },
  {
    version: '3.3.0',
    date: '19 Mai 2026',
    items: [
      { type: 'feature', text: 'Programa de fidelidade com pontos, ranking e resgate em cupom' },
      { type: 'feature', text: 'Visão 360° do cliente com perfil, linha do tempo, pontos e ações rápidas (Loja Integrada, Bling e Nuvemshop)' },
      { type: 'feature', text: 'Construtor visual de fluxos de chatbot, com arrastar e soltar' },
      { type: 'feature', text: 'Calendário de conteúdo do Instagram com editor e análises' },
      { type: 'feature', text: 'Relatórios de atendimento com pesquisa de satisfação (CSAT)' },
      { type: 'feature', text: 'Cupons para Bling e Nuvemshop, com validação de limite de usos' },
      { type: 'feature', text: 'Edição de preço e estoque direto na lista de produtos e exportação em CSV' },
      { type: 'improvement', text: 'E-mail marketing com rastreio de abertura e clique e envio de imagens' },
    ],
  },
  {
    version: '3.2.0',
    date: '18 Mai 2026',
    items: [
      { type: 'feature', text: 'Instagram: resposta automática em mensagens diretas, com checagem para não repetir' },
      { type: 'feature', text: 'Instagram: busca periódica de solicitações de mensagem' },
      { type: 'feature', text: 'Botão para excluir automações simples do Instagram' },
      { type: 'feature', text: 'Seletor de canal para quem tem várias contas do Instagram' },
      { type: 'fix', text: 'Comentário para mensagem direta usa o texto configurado e não envia em duplicidade' },
      { type: 'fix', text: 'Conexão e assinatura de webhooks do Instagram estabilizadas' },
    ],
  },
  {
    version: '3.1.0',
    date: '13 Mai 2026',
    items: [
      { type: 'feature', text: 'Integração com a Nuvemshop: conexão, sincronização e webhooks' },
      { type: 'feature', text: 'Nuvemshop aparece em Vendas, Clientes e Produtos' },
      { type: 'feature', text: 'Instagram: mensagem de boas-vindas por anúncio' },
      { type: 'feature', text: 'Instagram: insights de desempenho trazidos da Meta' },
      { type: 'improvement', text: 'Sincronização de produtos do Bling mais resistente em grandes volumes' },
      { type: 'fix', text: 'Quem cria a conta passa a ser sempre administrador da própria equipe' },
    ],
  },
  {
    version: '3.0.0',
    date: '08 Mai 2026',
    items: [
      { type: 'feature', text: 'SpyPro migrou para infraestrutura própria, com sincronizações que se recuperam sozinhas' },
      { type: 'feature', text: 'Faixa de progresso das sincronizações, que mantém a contagem final concluída' },
      { type: 'improvement', text: 'Exclusão de integrações e de contas mais confiável em volumes grandes' },
      { type: 'improvement', text: 'Atualização em tempo real da tela de atendimentos estabilizada' },
      { type: 'improvement', text: 'Recuperação de carrinho abandonado descontinuada' },
    ],
  },
];
