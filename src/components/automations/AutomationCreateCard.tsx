import { Plus } from 'lucide-react';

interface AutomationCreateCardProps {
  icon: React.ReactNode;
  title?: string;
  subtitle?: string;
  onClick: () => void;
  borderAccentClass?: string;
}

export function AutomationCreateCard({
  icon,
  title = 'Criar nova automação',
  subtitle,
  onClick,
  borderAccentClass = 'hover:border-primary/30',
}: AutomationCreateCardProps) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-lg bg-muted/30 p-3 border border-dashed border-border/50 transition-all duration-200 hover:bg-muted/50 ${borderAccentClass} cursor-pointer`}
    >
      {icon}
      <div className="flex-1">
        <h4 className="font-medium text-foreground">{title}</h4>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
