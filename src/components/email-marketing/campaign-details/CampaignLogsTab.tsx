import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { statusLabels } from "./campaignDetailsHelpers";

interface Props {
  isLoading: boolean;
  logs: any[] | undefined;
}

export function CampaignLogsTab({ isLoading, logs }: Props) {
  return (
    <TabsContent value="logs" className="flex-1 overflow-hidden mt-4">
      <ScrollArea className="h-[400px]">
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : !logs || logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3" />
            <p>Nenhum log disponível</p>
          </div>
        ) : (
          <>
            {logs.length === 500 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-xs text-muted-foreground mb-2">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Mostrando os 500 primeiros logs. Podem existir mais registros.
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead>Entregue em</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const statusConfig = statusLabels[log.status] || { label: log.status, className: "bg-secondary" };
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">{log.recipient_email}</TableCell>
                      <TableCell><Badge className={cn("text-xs", statusConfig.className)}>{statusConfig.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.sent_at ? format(new Date(log.sent_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.delivered_at ? format(new Date(log.delivered_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] truncate">{log.error_message || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </ScrollArea>
    </TabsContent>
  );
}
