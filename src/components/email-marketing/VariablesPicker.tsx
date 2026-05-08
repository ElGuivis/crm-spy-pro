import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Variable } from 'lucide-react';
import { EMAIL_VARIABLES } from '@/lib/email-variables';

interface VariablesPickerProps {
  onSelect: (variable: string) => void;
}

export function VariablesPicker({ onSelect }: VariablesPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Variable className="h-4 w-4 mr-2" />
          Inserir Variável
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Variáveis Disponíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(EMAIL_VARIABLES).map(([key, { label, example }]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onSelect(`{{${key}}}`)}
            className="flex flex-col items-start"
          >
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">
              {`{{${key}}}`} → {example}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
