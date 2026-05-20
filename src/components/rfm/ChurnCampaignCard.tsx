import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Loader2, Save, Users, Zap, MessageSquare, Clock } from "lucide-react";
import { useChurnCampaign } from "@/hooks/useChurnCampaign";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ChurnCampaignCard() {
  const { tenantId } = useAuth();
  const { config, isLoading, stats, save, toggle } = useChurnCampaign();

  const [threshold, setThreshold]   = useState<number | null>(null);
  const [cooldown, setCooldown]      = useState<number | null>(null);
  const [channel, setChannel]        = useState<string | null>(null);
  const [waIntegId, setWaIntegId]    = useState<string | null>(null);
  const [waMessage, setWaMessage]    = useState<string | null>(null);
  const [editing, setEditing]        = useState(false);

  const { data: waIntegrations } = useQuery({
    queryKey: ["wa-integrations-churn", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("integrations").select("id, name, metadata").eq("type", "evolution_whatsapp").eq("status", "connected");
      return data || [];
    },
    enabled: !!tenantId,
  });

  const effectiveThreshold = threshold  ?? config?.churn_threshold  ?? 0.7;
  const effectiveCooldown  = cooldown   ?? config?.cooldown_days     ?? 30;
  const effectiveChannel   = channel    ?? config?.channel           ?? "whatsapp";
  const effectiveWaId      = waIntegId  ?? config?.whatsapp_integration_id ?? "";
  const effectiveMessage   = waMessage  ?? config?.whatsapp_message  ?? "Olá {primeiro_nome}, sentimos sua falta! Temos uma oferta especial esperando por você. 🎁";

  const handleSave = async () => {
    await save.mutateAsync({
      churn_threshold:         effectiveThreshold,
      cooldown_days:           effectiveCooldown,
      channel:                 effectiveChannel as "whatsapp" | "email",
      whatsapp_integration_id: effectiveChannel === "whatsapp" ? effectiveWaId || null : null,
      whatsapp_message:        effectiveChannel === "whatsapp" ? effectiveMessage : null,
      name:                    "Campanha Anti-Churn",
    });
    setEditing(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={config?.is_active ? "border-orange-300 dark:border-orange-800" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Campanha Anti-Churn
            {config?.is_active && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">Ativa</Badge>
            )}
          </CardTitle>
          <Switch
            checked={config?.is_active ?? false}
            onCheckedChange={(v) => toggle.mutate(v)}
            disabled={toggle.isPending}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Dispara automaticamente para clientes com alto risco de churn, todo dia às 08h.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs text-muted-foreground">Em risco agora</span>
            </div>
            <p className="text-2xl font-bold text-orange-600">{stats?.atRiskCount ?? 0}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Acionados este mês</span>
            </div>
            <p className="text-2xl font-bold">{stats?.totalTriggeredThisMonth ?? 0}</p>
          </div>
        </div>

        {config?.last_run_at && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Último disparo: {format(new Date(config.last_run_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        )}

        {/* Config — shows when editing or no config saved yet */}
        {(editing || !config) ? (
          <div className="space-y-4 pt-2 border-t border-border/50">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Limiar de risco</Label>
                <span className="text-sm font-medium text-orange-600">{Math.round(effectiveThreshold * 100)}%</span>
              </div>
              <Slider
                min={40} max={95} step={5}
                value={[Math.round(effectiveThreshold * 100)]}
                onValueChange={([v]) => setThreshold(v / 100)}
              />
              <p className="text-xs text-muted-foreground">Disparar quando churn_probability ≥ {Math.round(effectiveThreshold * 100)}%</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Canal</Label>
                <Select value={effectiveChannel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Cooldown (dias)</Label>
                <Input
                  type="number" min={7} max={90}
                  value={effectiveCooldown}
                  onChange={e => setCooldown(Number(e.target.value))}
                  className="h-9"
                />
              </div>
            </div>

            {effectiveChannel === "whatsapp" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">WhatsApp para envio</Label>
                  <Select value={effectiveWaId} onValueChange={setWaIntegId}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
                    <SelectContent>
                      {(waIntegrations || []).map((i: { id: string; name: string; metadata?: { instanceName?: string } }) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.name}{i.metadata?.instanceName ? ` (${i.metadata.instanceName})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Mensagem
                  </Label>
                  <Textarea
                    rows={3}
                    value={effectiveMessage}
                    onChange={e => setWaMessage(e.target.value)}
                    placeholder="Olá {primeiro_nome}, sentimos sua falta!"
                  />
                  <p className="text-xs text-muted-foreground">Use {"{primeiro_nome}"}, {"{nome}"}, {"{email}"} como variáveis.</p>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={save.isPending} className="gap-2 flex-1">
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
              {config && <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>}
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-2 border-t border-border/50 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Limiar</span><strong className="text-foreground">{Math.round((config.churn_threshold ?? 0.7) * 100)}%</strong></div>
            <div className="flex justify-between text-muted-foreground"><span>Canal</span><strong className="text-foreground capitalize">{config.channel}</strong></div>
            <div className="flex justify-between text-muted-foreground"><span>Cooldown</span><strong className="text-foreground">{config.cooldown_days} dias</strong></div>
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setEditing(true)}>
              Editar configuração
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
