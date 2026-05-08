import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, Calendar, DollarSign, Hash, AlertTriangle, TrendingDown, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { RFMSnapshot } from '@/hooks/useRFMData';

const segmentColors: Record<string, string> = {
  'Campeões': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'Fiéis': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'Novos Clientes': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'Promissores': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'Em Risco': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'Alto Valor em Risco': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'Hibernando/Perdidos': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  'Outros': 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
};

const churnColors: Record<string, string> = {
  'saudavel': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'atencao': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'risco': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'critico': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const churnLabels: Record<string, string> = {
  'saudavel': 'Saudável',
  'atencao': 'Atenção',
  'risco': 'Risco',
  'critico': 'Crítico',
};

const segmentMessages: Record<string, string> = {
  'Campeões': 'Olá {nome}! 🏆 Como cliente VIP, temos uma oferta exclusiva para você!',
  'Fiéis': 'Olá {nome}! ❤️ Obrigado por ser um cliente fiel! Temos novidades para você.',
  'Novos Clientes': 'Olá {nome}! 👋 Seja bem-vindo! Use o cupom BEMVINDO para 10% na sua próxima compra!',
  'Promissores': 'Olá {nome}! 🚀 Temos produtos que combinam com suas últimas compras!',
  'Em Risco': 'Olá {nome}! Sentimos sua falta! 💛 Preparamos uma oferta especial para você voltar.',
  'Alto Valor em Risco': 'Olá {nome}! Sentimos muito sua falta! 🌟 Temos uma condição exclusiva esperando por você.',
  'Hibernando/Perdidos': 'Olá {nome}! Faz tempo que não nos vemos! 😊 Que tal conferir nossas novidades?',
  'Outros': 'Olá {nome}! Temos novidades para você! 🎉',
};

function getExplanation(snapshot: RFMSnapshot): string[] {
  const reasons: string[] = [];
  const recency = snapshot.recency_days || 0;
  const avgInterval = snapshot.avg_order_interval_days;
  const ordersCount = snapshot.orders_count || 0;
  const segment = snapshot.segment_name || '';

  if (avgInterval && avgInterval > 0) {
    const ratio = recency / avgInterval;
    if (ratio > 2) {
      reasons.push(`⚠️ Está há ${recency} dias sem comprar (média dele = ${Math.round(avgInterval)} dias). Isso é ${ratio.toFixed(1)}x o intervalo normal.`);
    } else if (ratio > 1.5) {
      reasons.push(`🟡 ${recency} dias sem compra, acima da média de ${Math.round(avgInterval)} dias.`);
    } else if (ratio <= 1) {
      reasons.push(`✅ Comprou há ${recency} dias, dentro do padrão (média: ${Math.round(avgInterval)} dias).`);
    }
  } else {
    reasons.push(`📅 Última compra há ${recency} dias.`);
  }

  if (ordersCount === 1) {
    reasons.push(`🆕 Fez apenas 1 compra. Incentivar a 2ª compra é prioridade.`);
  } else if (ordersCount >= 5) {
    reasons.push(`🔄 Cliente recorrente com ${ordersCount} pedidos.`);
  }

  if (segment === 'Alto Valor em Risco' || segment === 'Em Risco') {
    reasons.push(`🚨 Segmento "${segment}" — requer ação de reativação.`);
  } else if (segment === 'Campeões') {
    reasons.push(`🏆 Cliente top! Manter com atendimento VIP e upsell premium.`);
  }

  return reasons;
}

function formatWhatsAppLink(phone: string | null, name: string | null, segment: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return null;
  const fullNumber = cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
  const template = segmentMessages[segment || 'Outros'] || segmentMessages['Outros'];
  const message = template.replace('{nome}', name?.split(' ')[0] || 'cliente');
  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(message)}`;
}

interface RFMClientDetailDialogProps {
  snapshot: RFMSnapshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RFMClientDetailDialog({ snapshot, open, onOpenChange }: RFMClientDetailDialogProps) {
  if (!snapshot) return null;

  const explanations = getExplanation(snapshot);
  const whatsappLink = formatWhatsAppLink(snapshot.customer_phone, snapshot.customer_name, snapshot.segment_name);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {snapshot.customer_name || 'Cliente sem nome'}
          </DialogTitle>
          <DialogDescription>
            {snapshot.customer_email || snapshot.customer_phone || 'Detalhes do cliente'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Segment + Churn */}
          <div className="flex gap-2 flex-wrap">
            <Badge className={segmentColors[snapshot.segment_name || 'Outros']} variant="secondary">
              {snapshot.segment_name || 'Outros'}
            </Badge>
            <Badge className={churnColors[snapshot.churn_risk || 'saudavel']} variant="secondary">
              Churn: {churnLabels[snapshot.churn_risk || 'saudavel']}
            </Badge>
            <Badge variant="outline" className="font-mono">
              RFM {snapshot.rfm_score}
            </Badge>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Último Pedido</p>
                <p className="font-medium text-sm">
                  {snapshot.last_order_date ? format(new Date(snapshot.last_order_date), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Dias sem compra</p>
                <p className="font-medium text-sm">{snapshot.recency_days || 0} dias</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Pedidos</p>
                <p className="font-medium text-sm">{snapshot.orders_count || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total Gasto</p>
                <p className="font-medium text-sm">
                  R$ {Number(snapshot.revenue_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Extra metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Ticket Médio</p>
                <p className="font-medium text-sm">
                  R$ {Number(snapshot.aov || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            {snapshot.avg_order_interval_days && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Intervalo Médio</p>
                  <p className="font-medium text-sm">{Math.round(snapshot.avg_order_interval_days)} dias</p>
                </div>
              </div>
            )}
          </div>

          {/* Explanations */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Por que este segmento?
            </h4>
            <div className="space-y-1">
              {explanations.map((e, i) => (
                <p key={i} className="text-sm text-muted-foreground">{e}</p>
              ))}
            </div>
          </div>

          {/* Recommended Action */}
          {snapshot.segment_action && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs font-semibold text-primary mb-1">Ação Recomendada</p>
              <p className="text-sm">{snapshot.segment_action}</p>
            </div>
          )}

          {/* WhatsApp Button */}
          {whatsappLink && (
            <Button asChild className="w-full gap-2" variant="default">
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                Enviar WhatsApp
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { formatWhatsAppLink, segmentMessages };
