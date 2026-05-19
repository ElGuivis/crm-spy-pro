import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LoyaltyDashboard } from "@/components/loyalty/LoyaltyDashboard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

function IntegrationSelector({ onSelect }: { onSelect: (id: string) => void }) {
  const { tenantId } = useAuth();

  const { data: integrations = [], isLoading } = useQuery({
    queryKey: ["integrations-loyalty", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("integrations")
        .select("id, name, type, status")
        .eq("tenant_id", tenantId!)
        .eq("status", "connected")
        .in("type", ["loja_integrada", "bling", "nuvem_shop"])
        .order("name");
      return data || [];
    },
    enabled: !!tenantId,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando integrações...</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Star className="h-6 w-6 text-yellow-500" />
          Programa de Fidelidade
        </h1>
        <p className="text-muted-foreground mt-1">Gerencie pontos e recompensas por loja</p>
      </div>
      {integrations.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Star className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma integração de e-commerce conectada.</p>
            <p className="text-xs text-muted-foreground mt-1">Conecte Loja Integrada, Bling ou Nuvemshop em Integrações.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((integration) => (
            <Card
              key={integration.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSelect(integration.id)}
            >
              <CardContent className="pt-5 pb-4">
                <p className="font-semibold text-foreground">{integration.name}</p>
                <p className="text-xs text-muted-foreground capitalize mt-0.5">
                  {integration.type.replace("_", " ")}
                </p>
                <Button size="sm" className="mt-3 w-full" variant="outline">
                  <Star className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                  Gerenciar Pontos
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Fidelidade() {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  if (!integrationId) {
    return <IntegrationSelector onSelect={(id) => navigate(`/fidelidade/${id}`)} />;
  }

  return <LoyaltyDashboard integrationId={integrationId} />;
}
