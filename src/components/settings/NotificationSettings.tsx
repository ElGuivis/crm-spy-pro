import { Bell, BellOff, Volume2, VolumeX, ShoppingCart, MessageSquare, RefreshCw, Package, TrendingDown, Megaphone, Play } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWebNotifications, NotificationEventType, NotificationSound, previewSound } from '@/hooks/useWebNotifications';

const EVENT_CONFIG: { key: NotificationEventType; label: string; description: string; icon: React.ElementType }[] = [
  { key: 'new_order', label: 'Novos Pedidos', description: 'Quando um novo pedido é recebido', icon: ShoppingCart },
  { key: 'new_message', label: 'Novas Mensagens', description: 'Quando uma nova mensagem chega no chat', icon: MessageSquare },
  { key: 'sync_error', label: 'Erros de Sincronização', description: 'Quando uma sincronização falha', icon: RefreshCw },
  { key: 'low_stock', label: 'Estoque Baixo', description: 'Quando um produto está com estoque baixo', icon: Package },
  { key: 'rfm_alert', label: 'Alertas RFM', description: 'Alertas de migração de segmentos', icon: TrendingDown },
  { key: 'campaign_complete', label: 'Campanhas', description: 'Quando uma campanha é concluída', icon: Megaphone },
];

const SOUND_OPTIONS: { value: NotificationSound; label: string }[] = [
  { value: 'default', label: 'Padrão' },
  { value: 'chime', label: 'Chime' },
  { value: 'pop', label: 'Pop' },
  { value: 'bell', label: 'Sino' },
  { value: 'none', label: 'Sem som' },
];

export function NotificationSettings() {
  const { permission, requestPermission, prefs, setPrefs, setEventEnabled } = useWebNotifications();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-card-foreground">Notificações</h2>
          <p className="text-sm text-muted-foreground">Configure como deseja receber notificações</p>
        </div>
        {permission === 'default' && (
          <Button variant="outline" size="sm" onClick={requestPermission} className="gap-2">
            <Bell className="h-4 w-4" />
            Permitir notificações
          </Button>
        )}
        {permission === 'denied' && (
          <Badge variant="destructive" className="gap-1">
            <BellOff className="h-3 w-3" />
            Bloqueado pelo navegador
          </Badge>
        )}
        {permission === 'granted' && (
          <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
            <Bell className="h-3 w-3" />
            Ativo
          </Badge>
        )}
      </div>

      {/* Master toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            {prefs.enabled ? <Bell className="h-5 w-5 text-primary" /> : <BellOff className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div>
            <Label className="text-sm font-medium">Notificações habilitadas</Label>
            <p className="text-xs text-muted-foreground">Ativar/desativar todas as notificações</p>
          </div>
        </div>
        <Switch checked={prefs.enabled} onCheckedChange={(v) => setPrefs({ enabled: v })} />
      </div>

      {/* Sound toggle + type selector */}
      <div className="flex items-center justify-between rounded-lg border border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            {prefs.sound ? <Volume2 className="h-5 w-5 text-primary" /> : <VolumeX className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div>
            <Label className="text-sm font-medium">Som de notificação</Label>
            <p className="text-xs text-muted-foreground">Tocar som quando uma notificação chegar</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={prefs.sound}
            onCheckedChange={(v) => setPrefs({ sound: v })}
            disabled={!prefs.enabled}
          />
          {prefs.sound && (
            <>
              <Select
                value={prefs.soundType || 'default'}
                onValueChange={(v) => setPrefs({ soundType: v as NotificationSound })}
                disabled={!prefs.enabled}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUND_OPTIONS.filter(o => o.value !== 'none').map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => previewSound(prefs.soundType || 'default')}
                disabled={!prefs.enabled}
              >
                <Play className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Per-event toggles */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-card-foreground">Eventos</h3>
        <div className="space-y-1">
          {EVENT_CONFIG.map(({ key, label, description, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
              <Switch
                checked={prefs.events[key]}
                onCheckedChange={(v) => setEventEnabled(key, v)}
                disabled={!prefs.enabled}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
