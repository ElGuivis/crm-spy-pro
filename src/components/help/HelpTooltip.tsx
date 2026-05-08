import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface HelpTooltipProps {
  text: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function HelpTooltip({ text, side = 'top', className }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors",
            className
          )}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs">
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
