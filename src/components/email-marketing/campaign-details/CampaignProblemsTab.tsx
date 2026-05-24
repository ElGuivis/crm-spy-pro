import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { eventTypeLabels } from "./campaignDetailsHelpers";

interface Props {
  problems: any[];
}

export function CampaignProblemsTab({ problems }: Props) {
  return (
    <TabsContent value="problemas" className="flex-1 overflow-hidden mt-4">
      <ScrollArea className="h-[400px]">
        {problems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-3 text-primary" />
            <p>Nenhum problema encontrado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {problems.map((event) => {
              const config = eventTypeLabels[event.event_type] || {
                label: event.event_type,
                className: "bg-destructive/10 text-destructive",
              };
              return (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                  <Badge className={cn("shrink-0 mt-0.5", config.className)}>{config.label}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{event.recipient_email}</p>
                    {event.metadata && (
                      <p className="text-xs text-muted-foreground mt-1">{JSON.stringify(event.metadata)}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(event.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </TabsContent>
  );
}
