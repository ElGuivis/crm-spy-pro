import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Settings, Save } from "lucide-react";
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

  const [name, setName] = useState("");
  const [pointsPerBrl, setPointsPerBrl] = useState("");
  const [minRedeem, setMinRedeem] = useState("");
  const [pointsToBrl, setPointsToBrl] = useState("");
  const [championMultiplier, setChampionMultiplier] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [initialized, setInitialized] = useState(false);

  if (program && !initialized) {
    setName(program.name);
    setPointsPerBrl(String(program.points_per_brl));
    setMinRedeem(String(program.min_points_redeem));
    setPointsToBrl(String(program.points_to_brl));
    setChampionMultiplier(String(program.champion_multiplier));
    setIsActive(program.is_active);
    setInitialized(true);
  }

  if (!program && !initialized) {
    setName("Programa de Pontos");
    setPointsPerBrl("1");
    setMinRedeem("100");
    setPointsToBrl("0.01");
    setChampionMultiplier("2");
    setInitialized(true);
  }

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
      const payload = {
        tenant_id: tenantId!,
        integration_id: integrationId,
        name,
        points_per_brl: ppb,
        min_points_redeem: mr,
        points_to_brl: ptb,
        champion_multiplier: cm,
        is_active: isActive,
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
        <div className="flex items-center justify-between pt-1">
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
