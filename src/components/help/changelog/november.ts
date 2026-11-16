import type { ChangelogEntry } from './types';

/** Novembro de 2026. Mais recente primeiro. */
export const NOVEMBER_CHANGELOG: ChangelogEntry[] = [
  {
    version: '4.7.0',
    date: '16 Nov 2026',
    items: [
      { type: 'feature', text: 'Histórico completo por cliente no Atendimento: um card só por número, e ao abrir a conversa aparecem as mensagens de todos os atendimentos daquele cliente, com marcas de "Mensagem automática", "Novo atendimento" e "Atendimento encerrado"' },
      { type: 'improvement', text: 'Cliente que responde uma mensagem automática em até 24 horas vai direto para um atendente, sem receber o menu; sem resposta em 24 horas a conversa fecha sozinha (antes 48 horas) e, se ele chamar depois, segue o fluxo normal' },
      { type: 'fix', text: 'Celular com e sem o nono dígito agora é reconhecido como o mesmo cliente: a resposta de quem tem número antigo no WhatsApp não vira mais um contato novo nem cai no menu' },
      { type: 'fix', text: 'Catálogo WhatsApp mostra todos os produtos disponíveis (antes aparecia só uma parte), inclusive os de produto simples, e tamanhos e cores com nome correto mesmo quando a loja não informa' },
      { type: 'feature', text: 'Filtros do catálogo refeitos, na página e no envio pela conversa: busca por nome ou SKU, tipo, cor e tamanho na mesma variação, ordenação, só com estoque e opção de incluir produtos fora do site' },
      { type: 'improvement', text: 'A seleção do catálogo vale para todos os produtos: trocar o filtro não tira do envio o que você já marcou; produtos sem foto na loja são avisados em vez de sumirem sem explicação' },
      { type: 'fix', text: 'Bling: conexão e sincronização de produtos voltaram a funcionar; todo o módulo (produtos, pedidos, clientes e lojas) passou a usar o novo endereço oficial da API do Bling, e o erro real do Bling aparece na tela quando algo falha' },
    ],
  },
  {
    version: '4.6.0',
    date: '10 Nov 2026',
    items: [
      { type: 'feature', text: 'Cashback com liberação programada: o crédito do pedido fica pendente pelos dias que você definir e só vira cupom depois que o sistema confere de novo que o pedido não foi cancelado ou devolvido' },
      { type: 'feature', text: 'Cupom de cashback inteligente: desconta uma % do carrinho (ex.: 30%) com teto no valor do crédito, pedido mínimo (valor fixo ou múltiplo do crédito), pessoal (só quem ganhou usa) e acumulável com outras promoções, tudo configurável na tela' },
      { type: 'improvement', text: 'O cashback agora é calculado sobre os produtos que o cliente pagou de fato, sem o frete, e nunca sobre o valor já abatido por outro desconto' },
      { type: 'feature', text: 'Cupom de cashback ainda não usado é desativado na loja automaticamente se o pedido for cancelado, devolvido ou entrar em chargeback' },
      { type: 'feature', text: 'Extrato do cashback (menu do cartão em Automação): cada crédito com a situação real (aguardando, disponível, usado, vencido, cancelado), totais por situação e busca por cliente, pedido ou cupom' },
      { type: 'feature', text: 'Lista de exclusão do cashback: funcionários, parceiros ou clientes bloqueados nunca ganham crédito' },
      { type: 'improvement', text: 'Mensagens de cashback ganham as variáveis {{percentual_max}} e {{pedido_minimo}} e uma simulação ao vivo mostra, na hora de configurar, o que uma compra de exemplo gera' },
      { type: 'improvement', text: 'Todo o sistema passa a funcionar no horário de Brasília: banco de dados, automações, relatórios e as datas exibidas na tela, mesmo que o aparelho esteja em outro fuso' },
      { type: 'fix', text: 'Aniversário disparava às 21h do dia anterior e o lembrete de cashback considerava o dia seguinte a partir das 21h; agora ambos seguem o dia de Brasília' },
      { type: 'fix', text: 'Regras de horário das automações do Instagram (dia e hora de funcionamento) eram comparadas com 3 horas de diferença; corrigido' },
      { type: 'fix', text: 'Validade dos cupons de aniversário, reativação e cashback e a data de referência do RFM agora usam o dia de Brasília' },
    ],
  },
  {
    version: '4.5.0',
    date: '09 Nov 2026',
    items: [
      { type: 'feature', text: 'Novo módulo Google Ads (menu e página /google-ads): conecta a conta, sincroniza campanhas, palavras, termos de pesquisa, anúncios e conversões, e acompanha o gasto contra um teto mensal' },
      { type: 'feature', text: 'Diagnóstico e consultor com IA: encontra desperdício e oportunidades, explica o motivo e sugere a ação, usando a IA que você já conectou' },
      { type: 'feature', text: 'Botão "Implementar": aplique no Google Ads direto do CRM (palavras negativas, pausar, ajustar orçamento e lance, metas de conversão), com histórico completo e desfazer' },
      { type: 'feature', text: 'Economia real da loja: o CRM calcula o ROAS de equilíbrio com os seus pedidos e custos, define metas por campanha e concilia o que o Google diz que vendeu com o que realmente entrou' },
      { type: 'feature', text: 'Medição de resultado das mudanças em 7 e 14 dias, com a taxa de acerto por tipo de ação, para você saber o que realmente funcionou' },
      { type: 'feature', text: 'Revisor de propostas: antes de sugerir, o sistema evita ações conflitantes, repetidas, ruidosas ou em campanhas ainda em aprendizado' },
      { type: 'feature', text: 'Alertas automáticos: mudança feita fora do CRM, ROAS caindo na semana, gasto acelerado, anúncio reprovado, ações de compra duplicadas e Google sem conversão enquanto há pedidos no CRM' },
      { type: 'feature', text: 'Reconstruir campanha de Pesquisa, criar anúncio novo com IA e checar a página de destino antes de veicular' },
      { type: 'feature', text: 'Redator de anúncios especialista: escreve títulos e descrições com fatos reais da loja (produtos, cores realmente vendidas, preços), dá uma nota estimada, filtra promessas que não podem ser feitas e reescreve a pedido' },
      { type: 'improvement', text: 'A hora das mudanças da conta passou a ser convertida corretamente do fuso da conta' },
      { type: 'fix', text: 'Termo de pesquisa negativado sai das listas na hora, e o campo ausente nas metas de conversão deixou de gerar um erro falso na conferência' },
    ],
  },
];
