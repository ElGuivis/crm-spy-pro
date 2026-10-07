import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { eventTypeLabels } from "./campaignDetailsHelpers";

import type { CampaignEvent } from "@/hooks/useCampaignMetrics";
interface Props {
  isLoading: boolean;
  events: CampaignEvent[] | undefined;
}

export function CampaignTimelineTab({ isLoading, events }: Props) {
  return (
    <TabsContent value="timeline" className="flex-1 overflow-hidden mt-4">
      <ScrollArea className="h-[400px] pr-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3" />
            <p>Nenhum evento registrado ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.length === 500 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-xs text-muted-foreground mb-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Mostrando os 500 primeiros eventos. Podem existir mais registros.
              </div>
            )}
            {events.map((event) => {
              const config = eventTypeLabels[event.event_type] || { label: event.event_type, className: "bg-secondary" };
              return (
                <div key={event.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  <Badge className={cn("shrink-0", config.className)}>{config.label}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.recipient_email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(event.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
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
