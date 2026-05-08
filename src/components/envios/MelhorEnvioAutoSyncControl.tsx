import { useState, useEffect } from 'react';
import { Clock, Timer, RefreshCw, Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useMelhorEnvioAutoSync } from '@/hooks/useMelhorEnvioAutoSync';
import { formatDistanceToNow, differenceInSeconds } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MelhorEnvioAutoSyncControlProps {
  integrationId: string;
  onSyncTriggered?: () => void;
}

const INTERVAL_OPTIONS = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hora' },
];

export function MelhorEnvioAutoSyncControl({ 
  integrationId, 
  onSyncTriggered 
}: MelhorEnvioAutoSyncControlProps) {
  const {
    config,
    isLoading,
    isSaving,
    isActive,
    intervalMinutes,
    lastSyncAt,
    nextSyncAt,
    toggleAutoSync,
    updateInterval,
    triggerNow,
    refetch
  } = useMelhorEnvioAutoSync(integrationId);

  const [countdown, setCountdown] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);

  // Calculate countdown to next sync
  useEffect(() => {
    if (!isActive || !nextSyncAt) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const nextTime = new Date(nextSyncAt);
      const now = new Date();
      const secondsUntilNext = differenceInSeconds(nextTime, now);

      if (secondsUntilNext <= 0) {
        setCountdown('em breve');
      } else if (secondsUntilNext < 60) {
        setCountdown(`${secondsUntilNext}s`);
      } else {
        const minutes = Math.ceil(secondsUntilNext / 60);
        setCountdown(`${minutes}min`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isActive, nextSyncAt]);

  const handleToggle = async (enabled: boolean) => {
    await toggleAutoSync(enabled);
    if (enabled && onSyncTriggered) {
      onSyncTriggered();
    }
  };

  const handleIntervalChange = async (value: string) => {
    await updateInterval(parseInt(value));
  };

  const handleTriggerNow = async () => {
    setIsTriggering(true);
    await triggerNow();
    setIsTriggering(false);
    onSyncTriggered?.();
    refetch();
  };

  const formatLastSync = () => {
    if (!lastSyncAt) return null;
    return formatDistanceToNow(new Date(lastSyncAt), {
      addSuffix: true,
      locale: ptBR
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            isActive 
              ? 'border-green-500/30 bg-green-500/10' 
              : 'border-muted bg-muted/30'
          }`}>
            <Switch
              checked={isActive}
              onCheckedChange={handleToggle}
              disabled={isSaving}
              className="scale-90"
            />
            
            <span className={`font-medium ${isActive ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
              Auto-sync
            </span>

            {isActive && (
              <>
                <Select
                  value={intervalMinutes.toString()}
                  onValueChange={handleIntervalChange}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-7 w-[75px] text-xs border-none bg-transparent shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {countdown && (
                  <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
                    <Timer className="h-3 w-3" />
                    {countdown}
                  </Badge>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={handleTriggerNow}
                  disabled={isTriggering || isSaving}
                >
                  <Zap className={`h-4 w-4 ${isTriggering ? 'animate-pulse' : ''}`} />
                </Button>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1.5 text-xs">
            <p className="font-medium">Sincronização Automática de Envios</p>
            <p>
              <strong>Status:</strong>{' '}
              <span className={isActive ? 'text-green-500' : 'text-muted-foreground'}>
                {isActive ? 'Ativo' : 'Inativo'}
              </span>
            </p>
            {isActive && (
              <>
                <p><strong>Intervalo:</strong> {intervalMinutes} minutos</p>
                {countdown && <p><strong>Próxima execução:</strong> {countdown}</p>}
              </>
            )}
            {lastSyncAt && (
              <p className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <strong>Última sync:</strong> {formatLastSync()}
              </p>
            )}
            <p className="text-muted-foreground pt-1 border-t border-border">
              Verifica novos envios e atualiza rastreamentos automaticamente.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
