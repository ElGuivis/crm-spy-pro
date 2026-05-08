import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface MessagingStatsCardProps {
  sent: number;
  received: number;
  isLoading?: boolean;
}

export function MessagingStatsCard({ sent, received, isLoading }: MessagingStatsCardProps) {
  if (isLoading || (sent === 0 && received === 0)) return null;

  const total = sent + received;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Mensagens (30 dias)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowUpRight className="h-3 w-3 text-primary" />
            </div>
            <p className="text-2xl font-bold text-foreground">{sent.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground">Enviadas</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1 mb-1">
              <ArrowDownLeft className="h-3 w-3 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-foreground">{received.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground">Recebidas</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground mt-4">{total.toLocaleString('pt-BR')}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
