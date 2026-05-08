import { Coins, TrendingDown, Loader2 } from 'lucide-react';
import { useTokens } from '@/contexts/TokenContext';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TokenBalanceProps {
  variant?: 'sidebar' | 'card';
  className?: string;
}

export function TokenBalance({ variant = 'sidebar', className }: TokenBalanceProps) {
  const { balance, plan, isLoading } = useTokens();
  
  const planTokens = plan?.tokens || 1000;
  const percentage = (balance / planTokens) * 100;
  const isLow = percentage < 20;
  const isCritical = percentage < 10;

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-sidebar-accent/50",
        className
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  if (variant === 'sidebar') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
              "bg-sidebar-accent/50 hover:bg-sidebar-accent",
              className
            )}>
              <div className={cn(
                "p-1.5 rounded-md",
                isCritical ? "bg-destructive/20 text-destructive" :
                isLow ? "bg-yellow-500/20 text-yellow-500" :
                "bg-primary/20 text-primary"
              )}>
                <Coins className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-sidebar-foreground/60">Tokens</span>
                  {isLow && <TrendingDown className="h-3 w-3 text-yellow-500" />}
                </div>
                <p className={cn(
                  "text-sm font-semibold truncate",
                  isCritical ? "text-destructive" :
                  isLow ? "text-yellow-500" :
                  "text-sidebar-foreground"
                )}>
                  {balance.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            {plan ? (
              <>
                <p>Plano {plan.name}: {plan.tokens.toLocaleString('pt-BR')} tokens</p>
                <p className="text-muted-foreground text-xs">
                  {percentage.toFixed(1)}% restante
                </p>
              </>
            ) : (
              <p>Saldo: {balance.toLocaleString('pt-BR')} tokens</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn(
      "p-4 rounded-xl border border-border/50 bg-card",
      className
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "p-2 rounded-lg",
            isCritical ? "bg-destructive/20 text-destructive" :
            isLow ? "bg-yellow-500/20 text-yellow-500" :
            "bg-primary/20 text-primary"
          )}>
            <Coins className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Saldo de Tokens</h3>
            <p className="text-xs text-muted-foreground">
              {plan ? `Plano ${plan.name}` : 'Sem plano'}
            </p>
          </div>
        </div>
        {isLow && (
          <span className={cn(
            "text-xs px-2 py-1 rounded-full",
            isCritical ? "bg-destructive/20 text-destructive" : "bg-yellow-500/20 text-yellow-500"
          )}>
            {isCritical ? 'Crítico' : 'Baixo'}
          </span>
        )}
      </div>
      
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <span className={cn(
            "text-3xl font-bold",
            isCritical ? "text-destructive" :
            isLow ? "text-yellow-500" :
            "text-foreground"
          )}>
            {balance.toLocaleString('pt-BR')}
          </span>
          {plan && (
            <span className="text-sm text-muted-foreground">
              / {plan.tokens.toLocaleString('pt-BR')}
            </span>
          )}
        </div>
        
        {plan && (
          <>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isCritical ? "bg-destructive" :
                  isLow ? "bg-yellow-500" :
                  "bg-primary"
                )}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            
            <p className="text-xs text-muted-foreground text-right">
              {percentage.toFixed(1)}% restante
            </p>
          </>
        )}
      </div>
    </div>
  );
}
