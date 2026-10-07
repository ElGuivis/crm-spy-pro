import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Settings, Save, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface LoyaltyConfigCardProps {
  integrationId: string;
}

export function LoyaltyConfigCard({ integrationId }: LoyaltyConfigCardProps) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: program, isLoading } = useQuery({
    queryKey: ["loyalty-program", integrationId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_programs")
        .select("*")
        .eq("integration_id", integrationId)
        .maybeSingle();
      return data;
    },
    enabled: !!integrationId,
  });

  const { data: waIntegrations } = useQuery({
    queryKey: ["wa-integrations", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("integrations")
        .select("id, name, metadata")
        .eq("tenant_id", tenantId!)
        .eq("type", "evolution_whatsapp")
        .eq("status", "connected");
      return data || [];
    },
    enabled: !!tenantId,
  });

  const [name, setName] = useState("");
  const [pointsPerBrl, setPointsPerBrl] = useState("");
  const [minRedeem, setMinRedeem] = useState("");
  const [pointsToBrl, setPointsToBrl] = useState("");
  const [championMultiplier, setChampionMultiplier] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [waIntegrationId, setWaIntegrationId] = useState<string>("");
  const [templateEarn, setTemplateEarn] = useState(
    "Olá {{cliente_primeiro_nome}}! Você ganhou {{pontos}} pontos. Total: {{total_pontos}} pontos. 🎉"
  );
  const [templateRedeem, setTemplateRedeem] = useState(
    "Cupom {{cupom_codigo}} gerado com {{pontos}} pontos. Use até {{validade}}. 🎁"
  );

  useEffect(() => {
    if (isLoading) return;
    if (program) {
      setName(program.name);
      setPointsPerBrl(String(program.points_per_brl));
      setMinRedeem(String(program.min_points_redeem));
      setPointsToBrl(String(program.points_to_brl));
      setChampionMultiplier(String(program.champion_multiplier));
      setIsActive(program.is_active);
      setNotifyWhatsapp(program.notify_via_whatsapp ?? false);
      setWaIntegrationId(program.whatsapp_integration_id ?? "");
      if (program.notification_template_earn) {
        setTemplateEarn(program.notification_template_earn);
      }
      if (program.notification_template_redeem) {
        setTemplateRedeem(program.notification_template_redeem);
      }
    } else {
      setName("Programa de Pontos");
      setPointsPerBrl("1");
      setMinRedeem("100");
      setPointsToBrl("0.01");
      setChampionMultiplier("2");
    }
  }, [program, isLoading]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const ppb = parseFloat(pointsPerBrl);
      const mr = parseInt(minRedeem, 10);
      const ptb = parseFloat(pointsToBrl);
      const cm = parseFloat(championMultiplier);
      if (isNaN(ppb) || ppb <= 0) throw new Error("Pontos por R$1 inválido");
      if (isNaN(mr) || mr < 1) throw new Error("Mínimo de resgate inválido");
      if (isNaN(ptb) || ptb <= 0) throw new Error("Valor do ponto inválido");
      if (isNaN(cm) || cm < 1) throw new Error("Multiplicador inválido");
      if (notifyWhatsapp && !waIntegrationId) throw new Error("Selecione um canal WhatsApp para notificações");
      const payload = {
        tenant_id: tenantId!,
        integration_id: integrationId,
        name,
        points_per_brl: ppb,
        min_points_redeem: mr,
        points_to_brl: ptb,
        champion_multiplier: cm,
        is_active: isActive,
        notify_via_whatsapp: notifyWhatsapp,
        whatsapp_integration_id: notifyWhatsapp && waIntegrationId ? waIntegrationId : null,
        notification_template_earn: templateEarn,
        notification_template_redeem: templateRedeem,
        updated_at: new Date().toISOString(),
      };
      if (program) {
        const { error } = await supabase.from("loyalty_programs").update(payload).eq("id", program.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("loyalty_programs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loyalty-program", integrationId] });
      toast({ title: "Configurações salvas" });
    },
    onError: (err: Error) => toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Configurações do Programa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Nome do programa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Pontos por R$1 gasto</Label>
            <Input
              type="number" min="0.01" step="0.1"
              value={pointsPerBrl} onChange={(e) => setPointsPerBrl(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Mínimo para resgatar (pts)</Label>
            <Input
              type="number" min="1"
              value={minRedeem} onChange={(e) => setMinRedeem(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor do ponto (R$)</Label>
            <Input
              type="number" min="0.001" step="0.001"
              value={pointsToBrl} onChange={(e) => setPointsToBrl(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Ex: 0.01 = 100 pts → R$1,00
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Multiplicador Champions (RFM)</Label>
            <Input
              type="number" min="1" step="0.5"
              value={championMultiplier} onChange={(e) => setChampionMultiplier(e.target.value)}
              className="mt-1 h-8 text-sm"
            />
          </div>
        </div>

        <Separator />

        {/* Notificação WhatsApp */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              Notificar cliente via WhatsApp
            </Label>
            <Switch checked={notifyWhatsapp} onCheckedChange={setNotifyWhatsapp} />
          </div>

          {notifyWhatsapp && (
            <div className="space-y-3 pl-1">
              <div>
                <Label className="text-xs text-muted-foreground">Canal WhatsApp</Label>
                <Select value={waIntegrationId} onValueChange={setWaIntegrationId}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder="Selecione um canal..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(waIntegrations || []).map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name || (i.metadata as any)?.instanceName || i.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(!waIntegrations || waIntegrations.length === 0) && (
                  <p className="text-[10px] text-destructive mt-1">
                    Nenhum canal WhatsApp conectado. Conecte um em Integrações.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Mensagem ao ganhar pontos
                </Label>
                <Textarea
                  value={templateEarn}
                  onChange={(e) => setTemplateEarn(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Variáveis: {'{{cliente_primeiro_nome}}'} {'{{pontos}}'} {'{{total_pontos}}'}
                </p>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">
                  Mensagem ao resgatar pontos
                </Label>
                <Textarea
                  value={templateRedeem}
                  onChange={(e) => setTemplateRedeem(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs resize-none"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Variáveis: {'{{cupom_codigo}}'} {'{{pontos}}'} {'{{validade}}'}
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-xs text-muted-foreground">
              {isActive ? "Programa ativo" : "Programa inativo"}
            </Label>
          </div>
          <Button size="sm" onClick={() => save()} disabled={isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
