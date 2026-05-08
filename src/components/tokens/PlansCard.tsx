import { Check, Crown } from 'lucide-react';
import { useTokens, Plan } from '@/contexts/TokenContext';
import { cn } from '@/lib/utils';

interface PlansCardProps {
  className?: string;
}

export function PlansCard({ className }: PlansCardProps) {
  const { plan: currentPlan, plans } = useTokens();

  return (
    <div className={cn(
      "p-4 rounded-xl border border-border/50 bg-card",
      className
    )}>
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-accent/20">
          <Crown className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Planos</h3>
          <p className="text-xs text-muted-foreground">Planos disponíveis</p>
        </div>
      </div>
      
      <div className="grid gap-3">
        {plans.map((planOption) => (
          <PlanOption
            key={planOption.id}
            plan={planOption}
            isActive={currentPlan?.id === planOption.id}
          />
        ))}
      </div>
    </div>
  );
}

interface PlanOptionProps {
  plan: Plan;
  isActive: boolean;
}

function PlanOption({ plan, isActive }: PlanOptionProps) {
  return (
    <div
      className={cn(
        "w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left",
        isActive 
          ? "border-primary bg-primary/10" 
          : "border-border/50 bg-muted/30"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-3 h-3 rounded-full",
          isActive ? "bg-primary" : "bg-muted"
        )} />
        <div>
          <p className={cn(
            "font-medium",
            isActive ? "text-primary" : "text-foreground"
          )}>
            {plan.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {plan.tokens.toLocaleString('pt-BR')} tokens
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          R$ {plan.price.toFixed(2)}
        </span>
        {isActive && <Check className="h-4 w-4 text-primary" />}
      </div>
    </div>
  );
}
