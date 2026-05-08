import { useState } from 'react';
import { Gift, Settings2, Trash2, Send, MoreVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AutomationSubCard } from './AutomationSubCard';
import type { CashbackConfigData } from '@/hooks/useAutomationsData';

interface CashbackSubCardProps {
  config: CashbackConfigData;
  couponsCount: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function CashbackSubCard({ config, couponsCount, onEdit, onDelete }: CashbackSubCardProps) {
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);

  const handleMenuClick = (e: React.MouseEvent) => e.stopPropagation();

  const handleTestWebhook = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!config.webhook_url) return;
    setIsTesting(true);
    try {
      await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'no-cors',
        body: JSON.stringify({
          test: true,
          cliente_nome: 'João Teste',
          cliente_email: 'joao@teste.com',
          cliente_telefone: '11999999999',
          cupom: 'TEST10',
          valor_cupom: '10%',
          validade: '2025-12-31',
          pedido_numero: '123456',
          pedido_valor: 'R$ 150,00',
        }),
      });
      toast({ title: 'Webhook enviado', description: 'O teste foi enviado para o webhook configurado.' });
    } catch {
      toast({ title: 'Erro ao testar webhook', description: 'Não foi possível enviar o teste.', variant: 'destructive' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <AutomationSubCard
      icon={<Gift className="h-5 w-5" />}
      activeIcon={
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Gift className="h-5 w-5" />
        </div>
      }
      title={config.name || config.integration_name}
      subtitle={`${config.discount_percentage}% • ${config.coupon_duration_days} dias • ${couponsCount} cupons`}
      isActive={config.is_active}
      onClick={onEdit}
      extraActions={
        <div className="flex items-center gap-1" onClick={handleMenuClick}>
          {config.webhook_url && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleTestWebhook}
              disabled={isTesting}
            >
              {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover border border-border">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <Settings2 className="h-4 w-4 mr-2" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    />
  );
}
