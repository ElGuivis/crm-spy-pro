import { CheckCircle, Pause, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AutomationSubCardProps {
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  title: string;
  subtitle: string;
  isActive: boolean;
  onClick: () => void;
  extraActions?: React.ReactNode;
}

export function AutomationSubCard({ icon, activeIcon, title, subtitle, isActive, onClick, extraActions }: AutomationSubCardProps) {
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg bg-card p-3 border border-border/50 transition-all duration-200 hover:shadow-sm hover:border-primary/30 cursor-pointer"
    >
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg',
        isActive ? '' : 'bg-muted text-muted-foreground'
      )}>
        {isActive ? activeIcon : icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-foreground truncate">{title}</h4>
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
            isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}>
            {isActive ? <CheckCircle className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
            {isActive ? 'Ativa' : 'Pausada'}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {extraActions || (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Settings2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
