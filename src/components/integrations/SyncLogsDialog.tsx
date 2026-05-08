import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, XCircle, Loader2, Clock, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface WebhookEvent {
  id: string;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  status: string;
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

interface SyncLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationName: string;
  integrationId: string;
}

export function SyncLogsDialog({ open, onOpenChange, integrationName, integrationId }: SyncLogsDialogProps) {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (open && integrationId) fetchEvents();
  }, [open, integrationId]);

  const fetchEvents = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("li_webhook_events")
      .select("id, event_type, resource_type, resource_id, status, error, received_at, processed_at")
      .eq("integration_id", integrationId)
      .order("received_at", { ascending: false })
      .limit(50);
    if (!error) setEvents(data || []);
    setIsLoading(false);
  };

  const handleClearLogs = async () => {
    setIsClearing(true);
    const { error } = await supabase
      .from("li_webhook_events")
      .delete()
      .eq("integration_id", integrationId);
    if (!error) { toast.success("Logs limpos!"); setEvents([]); }
    else toast.error("Erro ao limpar logs");
    setIsClearing(false);
  };

  const getStatusIcon = (status: string) => {
    if (status === 'processed') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === 'processing') return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Webhook Events - {integrationName}
            </DialogTitle>
            {events.length > 0 && (
              <Button variant="outline" size="sm" className="gap-2 text-destructive" onClick={handleClearLogs} disabled={isClearing}>
                <Trash2 className="h-3.5 w-3.5" /> Limpar
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum evento de webhook encontrado</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {events.map((event) => (
                <div key={event.id} className={cn(
                  "rounded-lg border p-4",
                  event.status === 'processed' && "border-green-500/30 bg-green-500/5",
                  event.status === 'failed' && "border-destructive/30 bg-destructive/5",
                  event.status === 'received' && "border-border",
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(event.status)}
                      <span className="font-medium text-sm capitalize">{event.resource_type}</span>
                      <span className="text-xs text-muted-foreground">#{event.resource_id}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(event.received_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  {event.error && (
                    <p className="text-xs text-destructive mt-2">{event.error}</p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
