import { useChannels, useOutboundQueueErrors } from "@/hooks/useAtendimentoSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Smartphone, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export function ChannelSettings() {
  const { channels, isLoading } = useChannels();
  const { errors } = useOutboundQueueErrors();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Canais WhatsApp
          </CardTitle>
          <CardDescription>Status e saúde dos canais conectados</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum canal configurado</p>
          ) : (
            <div className="space-y-3">
              {channels.map(ch => (
                <div key={ch.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{ch.display_name}</span>
                      <Badge variant="outline" className="text-[10px]">{ch.provider}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{ch.phone_e164 || 'Sem número'}</p>
                  </div>
                  <Badge
                    variant={ch.status === 'connected' ? 'default' : 'destructive'}
                    className="gap-1"
                  >
                    {ch.status === 'connected' ? (
                      <Wifi className="h-3 w-3" />
                    ) : (
                      <WifiOff className="h-3 w-3" />
                    )}
                    {ch.status === 'connected' ? 'Conectado' : 'Desconectado'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Queue errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Últimos Erros de Envio
          </CardTitle>
          <CardDescription>Mensagens que falharam na fila de envio</CardDescription>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum erro recente ✅</p>
          ) : (
            <div className="space-y-2">
              {errors.map((err) => (
                <div key={err.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{err.to_phone_e164}</span>
                    <Badge variant={err.status === 'dead' ? 'destructive' : 'secondary'} className="text-[10px]">
                      {err.status} ({err.attempts}x)
                    </Badge>
                  </div>
                  {err.last_error && (
                    <p className="text-xs text-destructive line-clamp-2">{err.last_error}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    {format(new Date(err.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
