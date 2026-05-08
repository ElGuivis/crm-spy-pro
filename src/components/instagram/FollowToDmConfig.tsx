import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, UserPlus, MessageCircle, Clock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface FollowToDmConfigProps {
  channelId: string;
  followToDmCapable: boolean;
}

interface FollowConfig {
  id?: string;
  is_active: boolean;
  welcome_text: string;
  delay_seconds: number;
  once_per_user: boolean;
}

export function FollowToDmConfig({ channelId, followToDmCapable }: FollowToDmConfigProps) {
  const { tenantId, user } = useAuth();
  const [config, setConfig] = useState<FollowConfig>({
    is_active: false,
    welcome_text: 'Olá! Obrigado por me seguir 🎉 Seja bem-vindo(a)!',
    delay_seconds: 5,
    once_per_user: true,
  });
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    const load = async () => {
      setIsLoading(true);
      const [configRes, flagRes] = await Promise.all([
        supabase.from('instagram_follow_dm_configs')
          .select('id, is_active, welcome_text, delay_seconds, once_per_user')
          .eq('channel_id', channelId)
          .maybeSingle(),
        supabase.from('instagram_feature_flags')
          .select('is_enabled')
          .eq('channel_id', channelId)
          .eq('feature_key', 'follow_to_dm')
          .maybeSingle(),
      ]);
      if (configRes.data) {
        setConfig({
          id: configRes.data.id,
          is_active: configRes.data.is_active ?? false,
          welcome_text: (configRes.data as any).welcome_text ?? '',
          delay_seconds: configRes.data.delay_seconds ?? 5,
          once_per_user: (configRes.data as any).once_per_user ?? true,
        });
      }
      setFeatureEnabled(flagRes.data?.is_enabled ?? false);
      setIsLoading(false);
    };
    load();
  }, [channelId]);

  const handleSave = async () => {
    if (!tenantId || !channelId) return;
    setIsSaving(true);
    try {
      // Upsert config
      const payload = {
        tenant_id: tenantId,
        channel_id: channelId,
        is_active: config.is_active,
        welcome_text: config.welcome_text,
        delay_seconds: config.delay_seconds,
        once_per_user: config.once_per_user,
      };

      if (config.id) {
        const { error } = await supabase.from('instagram_follow_dm_configs')
          .update(payload).eq('id', config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('instagram_follow_dm_configs')
          .insert(payload).select('id').single();
        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      // Upsert feature flag
      const { error: flagErr } = await supabase.from('instagram_feature_flags').upsert({
        tenant_id: tenantId,
        channel_id: channelId,
        feature_key: 'follow_to_dm',
        is_enabled: config.is_active,
        enabled_at: config.is_active ? new Date().toISOString() : null,
        enabled_by: config.is_active ? user?.id : null,
      }, { onConflict: 'channel_id,feature_key' });
      if (flagErr) throw flagErr;

      setFeatureEnabled(config.is_active);
      toast.success('Configuração salva com sucesso!');
    } catch (err) {
      toast.error('Erro ao salvar configuração');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-32 flex items-center justify-center text-muted-foreground">Carregando...</div>
        </CardContent>
      </Card>
    );
  }

  if (!followToDmCapable) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5" />
            Auto-DM para Novos Seguidores
          </CardTitle>
          <CardDescription>
            Sua conta ainda não possui a capability <strong>follow_to_dm</strong>. 
            Isso geralmente é habilitado automaticamente pela Meta para contas Business verificadas com a permissão <code>instagram_manage_messages</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5" />
              Auto-DM para Novos Seguidores
            </CardTitle>
            <CardDescription>
              Envie automaticamente uma mensagem de boas-vindas quando alguém começar a te seguir no Instagram.
            </CardDescription>
          </div>
          <Badge variant={featureEnabled && config.is_active ? 'default' : 'secondary'}>
            {featureEnabled && config.is_active ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-primary" />
            <div>
              <Label className="text-sm font-medium">Ativar Auto-DM</Label>
              <p className="text-xs text-muted-foreground">Enviar mensagem automática para novos seguidores</p>
            </div>
          </div>
          <Switch
            checked={config.is_active}
            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, is_active: checked }))}
          />
        </div>

        {/* Welcome text */}
        <div className="space-y-2">
          <Label>Mensagem de boas-vindas</Label>
          <Textarea
            value={config.welcome_text}
            onChange={(e) => setConfig(prev => ({ ...prev, welcome_text: e.target.value }))}
            placeholder="Ex: Olá! Obrigado por me seguir 🎉"
            rows={4}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">{config.welcome_text.length}/1000 caracteres</p>
        </div>

        {/* Preview */}
        {config.welcome_text && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview da mensagem</Label>
            <div className="bg-primary/10 rounded-2xl rounded-bl-none px-4 py-3 max-w-[80%] text-sm">
              {config.welcome_text}
            </div>
          </div>
        )}

        {/* Delay */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Label>Delay antes de enviar: <strong>{config.delay_seconds}s</strong></Label>
          </div>
          <Slider
            value={[config.delay_seconds]}
            onValueChange={([val]) => setConfig(prev => ({ ...prev, delay_seconds: val }))}
            min={0}
            max={60}
            step={5}
          />
          <p className="text-xs text-muted-foreground">
            Um pequeno delay torna a mensagem mais natural. Recomendado: 5-15 segundos.
          </p>
        </div>

        {/* Once per user */}
        <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Enviar apenas uma vez por usuário</Label>
              <p className="text-xs text-muted-foreground">Evita envios duplicados se a pessoa seguir e parar de seguir</p>
            </div>
          </div>
          <Switch
            checked={config.once_per_user}
            onCheckedChange={(checked) => setConfig(prev => ({ ...prev, once_per_user: checked }))}
          />
        </div>

        {/* Save */}
        <Button onClick={handleSave} disabled={isSaving || !config.welcome_text.trim()} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar Configuração'}
        </Button>
      </CardContent>
    </Card>
  );
}
