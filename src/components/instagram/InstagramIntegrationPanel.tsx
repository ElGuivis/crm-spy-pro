import { useState } from 'react';
import { Instagram, RefreshCw, Loader2, CheckCircle2, XCircle, AlertTriangle, Wifi, WifiOff, Shield, Clock, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useInstagramChannel, InstagramChannel, InstagramCapabilities } from '@/hooks/useInstagramChannel';

import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function ChannelCard({
  channel,
  capabilities,
  onDisconnect,
  onHealthcheck,
  onReconnect,
  onRefetch,
  isConnecting,
}: {
  channel: InstagramChannel;
  capabilities: InstagramCapabilities | null;
  onDisconnect: (id: string) => void;
  onHealthcheck: (id: string) => void;
  onReconnect: () => void;
  onRefetch: () => void;
  isConnecting: boolean;
}) {
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await onDisconnect(channel.id);
      toast.success(`@${channel.instagram_username || channel.name} desconectado`);
    } catch {
      toast.error('Erro ao desconectar');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleHealthcheck = async () => {
    setIsCheckingHealth(true);
    try {
      await onHealthcheck(channel.id);
      toast.success('Healthcheck concluído');
    } catch {
      toast.error('Erro no healthcheck');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Conectado</Badge>;
      case 'expiring':
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Token Expirando</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="h-3 w-3 mr-1" />Token Expirado</Badge>;
      case 'error':
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20"><XCircle className="h-3 w-3 mr-1" />Erro</Badge>;
      default:
        return <Badge className="bg-muted text-muted-foreground"><WifiOff className="h-3 w-3 mr-1" />Desconectado</Badge>;
    }
  };

  const tokenExpiresAt = channel.token_expires_at ? new Date(channel.token_expires_at) : null;
  const daysLeft = tokenExpiresAt ? Math.ceil((tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const isExpired = daysLeft !== null && daysLeft <= 0;
  const isExpiring = daysLeft !== null && daysLeft <= 7;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-500/20">
              <Instagram className="h-5 w-5 text-pink-500" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {channel.instagram_username ? `@${channel.instagram_username}` : channel.name}
                {getStatusBadge(channel.status)}
              </CardTitle>
              <CardDescription className="text-xs">
                ID: {channel.ig_user_id}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            
            <Button variant="outline" size="sm" onClick={handleHealthcheck} disabled={isCheckingHealth}>
              {isCheckingHealth ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isDisconnecting} className="text-destructive hover:text-destructive">
              {isDisconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Token</p>
            {daysLeft !== null ? (
              <p className={`font-medium ${isExpired ? 'text-destructive' : isExpiring ? 'text-yellow-600' : 'text-foreground'}`}>
                {isExpired ? 'Expirado' : `${daysLeft} dias restantes`}
              </p>
            ) : (
              <p className="text-muted-foreground">-</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground flex items-center gap-1"><Wifi className="h-3.5 w-3.5" /> Webhook</p>
            <p className="font-medium">{channel.webhook_verified ?
              <span className="text-green-600">Verificado</span> :
              <span className="text-yellow-600">Pendente</span>
            }</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Último Sync</p>
            <p className="font-medium text-foreground">
              {channel.last_sync_at ? formatDistanceToNow(new Date(channel.last_sync_at), { addSuffix: true, locale: ptBR }) : '-'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground">Healthcheck</p>
            <p className="font-medium text-foreground">
              {channel.last_healthcheck_at ? formatDistanceToNow(new Date(channel.last_healthcheck_at), { addSuffix: true, locale: ptBR }) : '-'}
            </p>
          </div>
        </div>

        {capabilities && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> Capabilities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries({
                  'Comentários': capabilities.comments,
                  'Respostas Privadas': capabilities.private_replies,
                  'Story Reply': capabilities.story_reply,
                  'Story Mention': capabilities.story_mention,
                  'Live Comments': capabilities.live_comments,
                  'Welcome Ads': capabilities.welcome_ads,
                  'Ice Breakers': capabilities.ice_breakers,
                  'Menu Persistente': capabilities.persistent_menu,
                  'Follow to DM': capabilities.follow_to_dm,
                  'Share to DM': capabilities.share_to_dm,
                  'Publicação': capabilities.content_publish,
                  'Insights': capabilities.insights,
                  'Moderação': capabilities.moderation,
                }).map(([label, enabled]) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className={`text-xs ${enabled ? 'border-green-500/30 text-green-600 bg-green-500/5' : 'border-border text-muted-foreground'}`}
                  >
                    {enabled ? <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> : <XCircle className="h-2.5 w-2.5 mr-1" />}
                    {label}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {['expiring', 'expired', 'error'].includes(channel.status) && (
          <>
            <Separator />
            <Button
              onClick={onReconnect}
              disabled={isConnecting}
              className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:from-purple-700 hover:via-pink-700 hover:to-orange-600 text-white"
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Reconectar Instagram
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function InstagramIntegrationPanel() {
  const {
    channels,
    capabilitiesMap,
    isLoading,
    isConnecting,
    connect,
    disconnect,
    healthcheck,
    refetch,
  } = useInstagramChannel();

  const handleConnect = async () => {
    try {
      await connect();
    } catch {
      toast.error('Erro ao iniciar conexão com Instagram');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeChannels = channels.filter(c => c.status !== 'disconnected');

  return (
    <div className="space-y-4">
      {/* Show cards for each connected channel */}
      {activeChannels.map((ch) => (
        <ChannelCard
          key={ch.id}
          channel={ch}
          capabilities={capabilitiesMap[ch.id] || null}
          onDisconnect={disconnect}
          onHealthcheck={healthcheck}
          onReconnect={handleConnect}
          onRefetch={refetch}
          isConnecting={isConnecting}
        />
      ))}

      {/* Connect button - always show to allow adding more */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-500/20 mb-3">
            <Instagram className="h-6 w-6 text-pink-500" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-1">
            {activeChannels.length === 0 ? 'Conectar Instagram' : 'Conectar outro Instagram'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-4">
            {activeChannels.length === 0
              ? 'Conecte sua conta profissional do Instagram para gerenciar DMs, comentários e automações.'
              : 'Adicione mais contas profissionais do Instagram vinculadas ao seu Facebook.'
            }
          </p>
          <div className="flex gap-2">
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 hover:from-purple-700 hover:via-pink-700 hover:to-orange-600 text-white"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Instagram className="h-4 w-4 mr-2" />
              )}
              {activeChannels.length === 0 ? 'Conectar Instagram' : 'Conectar outro'}
            </Button>
            
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
