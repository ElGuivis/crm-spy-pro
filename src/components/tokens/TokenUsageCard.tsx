import { History, Zap, MessageCircle, Users, CreditCard, Loader2 } from 'lucide-react';
import { useTokens } from '@/contexts/TokenContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TokenUsageCardProps {
  className?: string;
  limit?: number;
}

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'automation':
      return <Zap className="h-4 w-4" />;
    case 'team_member':
      return <Users className="h-4 w-4" />;
    case 'credit':
      return <CreditCard className="h-4 w-4" />;
    case 'message':
      return <MessageCircle className="h-4 w-4" />;
    default:
      return <Zap className="h-4 w-4" />;
  }
};

const getTypeStyles = (type: string) => {
  switch (type) {
    case 'automation':
      return "bg-primary/20 text-primary";
    case 'team_member':
      return "bg-blue-500/20 text-blue-500";
    case 'credit':
      return "bg-green-500/20 text-green-500";
    case 'message':
      return "bg-whatsapp/20 text-whatsapp";
    default:
      return "bg-muted text-muted-foreground";
  }
};

export function TokenUsageCard({ className, limit = 5 }: TokenUsageCardProps) {
  const { usage, isLoading } = useTokens();
  
  const displayUsage = usage.slice(0, limit);

  if (isLoading) {
    return (
      <div className={cn(
        "p-4 rounded-xl border border-border/50 bg-card flex items-center justify-center",
        className
      )}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn(
      "p-4 rounded-xl border border-border/50 bg-card",
      className
    )}>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-muted">
          <History className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Uso Recente</h3>
          <p className="text-xs text-muted-foreground">Últimas {limit} transações</p>
        </div>
      </div>
      
      <div className="space-y-3">
        {displayUsage.map((item) => (
          <div 
            key={item.id}
            className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className={cn("p-1.5 rounded-md", getTypeStyles(item.type))}>
              {getTypeIcon(item.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {item.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(item.timestamp, { addSuffix: true, locale: ptBR })}
              </p>
            </div>
            <span className={cn(
              "text-sm font-semibold",
              item.type === 'credit' ? "text-green-500" : "text-destructive"
            )}>
              {item.type === 'credit' ? '+' : '-'}{item.tokens}
            </span>
          </div>
        ))}
        
        {displayUsage.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhum uso registrado ainda
          </p>
        )}
      </div>
    </div>
  );
}
