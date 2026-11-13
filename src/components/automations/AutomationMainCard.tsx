import { CheckCircle, Pause, Clock, Coins, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AutomationMainCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  activeCount: number;
  tokensPerExec: number;
  lastExecution: string;
  totalExecutions: number;
  expanded: boolean;
  onToggle: () => void;
  onCreate: () => void;
  accentClass?: string;
  children?: React.ReactNode;
}

export function AutomationMainCard({
  icon,
  title,
  description,
  activeCount,
  tokensPerExec,
  lastExecution,
  totalExecutions,
  expanded,
  onToggle,
  onCreate,
  accentClass = 'border-primary/50',
  children,
}: AutomationMainCardProps) {
  return (
    <div className="space-y-2">
      <div
        onClick={onToggle}
        className={cn(
          'group flex flex-wrap items-center gap-x-4 gap-y-3 md:flex-nowrap rounded-xl bg-card p-4 border transition-all duration-200 hover:shadow-md cursor-pointer',
          expanded ? `${accentClass} shadow-md` : 'border-border/50 hover:border-primary/30'
        )}
      >
        {icon}

        <div className="flex-1 min-w-[9rem] md:min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="font-semibold text-card-foreground">{title}</h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                activeCount > 0
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-muted text-muted-foreground border-border'
              )}
            >
              {activeCount > 0 ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  {activeCount} ativa{activeCount > 1 ? 's' : ''}
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3" />
                  Nenhuma ativa
                </>
              )}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="order-last flex w-full flex-wrap items-center gap-3 text-sm text-muted-foreground md:order-none md:w-auto md:gap-6">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50">
            <Coins className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground">{tokensPerExec}</span>
            <span className="whitespace-nowrap text-xs">tokens/exec</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {lastExecution}
          </div>
          <div className="ml-auto text-right md:ml-0">
            <p className="font-semibold text-card-foreground">{totalExecutions.toLocaleString()}</p>
            <p className="text-xs">execuções</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden gap-1 opacity-0 transition-opacity group-hover:opacity-100 md:inline-flex"
            onClick={(e) => {
              e.stopPropagation();
              onCreate();
            }}
          >
            <Plus className="h-3 w-3" />
            Criar
          </Button>
          <div className="flex h-8 w-8 items-center justify-center text-muted-foreground">
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </div>

      {expanded && children}
    </div>
  );
}
