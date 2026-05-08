import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Timer, Save, Zap } from "lucide-react";

export function AutoCloseSettings() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['auto-close-config', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('ai_assistant_configs')
        .select('id, auto_close_enabled, auto_close_minutes, auto_close_message, automation_auto_close_enabled, automation_auto_close_minutes, automation_auto_close_message')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Regular auto-close
  const [enabled, setEnabled] = useState(false);
  const [minutes, setMinutes] = useState('120');
  const [message, setMessage] = useState(
    'Como não tivemos mais contato, estamos encerrando o seu atendimento. Caso precise de alguma ajuda, fique à vontade para entrar em contato novamente!'
  );

  // Automation auto-close
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoMinutes, setAutoMinutes] = useState('120');
  const [autoMessage, setAutoMessage] = useState(
    'Como não tivemos mais contato estamos encerrando o seu atendimento, caso precise de alguma ajuda fique a vontade para entrar em contato novamente.'
  );

  useEffect(() => {
    if (config) {
      setEnabled(config.auto_close_enabled ?? false);
      setMinutes(String(config.auto_close_minutes ?? 120));
      setMessage(config.auto_close_message ?? '');
      setAutoEnabled(config.automation_auto_close_enabled ?? true);
      setAutoMinutes(String(config.automation_auto_close_minutes ?? 120));
      setAutoMessage(config.automation_auto_close_message ?? '');
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('No tenant');
      const payload = {
        auto_close_enabled: enabled,
        auto_close_minutes: parseInt(minutes) || 120,
        auto_close_message: message,
        automation_auto_close_enabled: autoEnabled,
        automation_auto_close_minutes: parseInt(autoMinutes) || 120,
        automation_auto_close_message: autoMessage,
      };

      if (config?.id) {
        const { error } = await supabase
          .from('ai_assistant_configs')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_assistant_configs')
          .insert({ ...payload, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-close-config'] });
      toast.success('Configurações de encerramento automático salvas');
    },
    onError: () => {
      toast.error('Erro ao salvar configurações');
    },
  });

  const hoursDisplay = Math.floor((parseInt(minutes) || 0) / 60);
  const minsDisplay = (parseInt(minutes) || 0) % 60;
  const autoHoursDisplay = Math.floor((parseInt(autoMinutes) || 0) / 60);
  const autoMinsDisplay = (parseInt(autoMinutes) || 0) % 60;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Regular auto-close */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Encerramento Automático — Conversas
          </CardTitle>
          <CardDescription>
            Encerre conversas automaticamente após um período sem resposta do cliente. 
            Não se aplica a conversas em atendimento humano.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar encerramento automático</Label>
              <p className="text-xs text-muted-foreground">
                Conversas sem interação serão encerradas automaticamente
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              <div>
                <Label>Tempo de inatividade (minutos)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Após esse tempo sem resposta do cliente, a conversa será encerrada.
                  {parseInt(minutes) > 0 && (
                    <span className="ml-1 font-medium">
                      ({hoursDisplay > 0 ? `${hoursDisplay}h` : ''}{minsDisplay > 0 ? `${minsDisplay}min` : ''})
                    </span>
                  )}
                </p>
                <Input
                  type="number"
                  min={5}
                  max={14400}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="120"
                  className="max-w-[200px]"
                />
              </div>

              <div>
                <Label>Mensagem de encerramento</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Mensagem enviada ao cliente quando a conversa for encerrada. Use {'{nome}'} para o nome do cliente.
                </p>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Digite a mensagem de encerramento..."
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Automation auto-close */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Encerramento Automático — Automações
          </CardTitle>
          <CardDescription>
            Configure o tempo para encerrar conversas originadas por automações (cashback, notificações de pedido, aniversário). 
            Enquanto a conversa de automação estiver aberta, o bot de atendimento <strong>não</strong> será acionado. 
            Após o encerramento, se o cliente entrar em contato, será atendido normalmente pelo bot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar encerramento de automações</Label>
              <p className="text-xs text-muted-foreground">
                Conversas de automação serão encerradas após o tempo configurado
              </p>
            </div>
            <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} />
          </div>

          {autoEnabled && (
            <>
              <div>
                <Label>Tempo de inatividade (minutos)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Tempo que o cliente tem para responder antes de fecharmos a conversa de automação.
                  {parseInt(autoMinutes) > 0 && (
                    <span className="ml-1 font-medium">
                      ({autoHoursDisplay > 0 ? `${autoHoursDisplay}h` : ''}{autoMinsDisplay > 0 ? `${autoMinsDisplay}min` : ''})
                    </span>
                  )}
                </p>
                <Input
                  type="number"
                  min={5}
                  max={14400}
                  value={autoMinutes}
                  onChange={(e) => setAutoMinutes(e.target.value)}
                  placeholder="120"
                  className="max-w-[200px]"
                />
              </div>

              <div>
                <Label>Mensagem de encerramento (automação)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Mensagem enviada quando a conversa de automação for encerrada. Use {'{nome}'} para o nome do cliente.
                </p>
                <Textarea
                  value={autoMessage}
                  onChange={(e) => setAutoMessage(e.target.value)}
                  rows={3}
                  placeholder="Digite a mensagem de encerramento..."
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="gap-1.5"
      >
        <Save className="h-4 w-4" />
        {saveMutation.isPending ? 'Salvando...' : 'Salvar configurações'}
      </Button>
    </div>
  );
}
