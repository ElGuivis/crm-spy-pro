import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Campaign, CampaignContact } from "./types";

interface CampaignDetailsDialogProps {
  campaign: Campaign | null;
  contacts: CampaignContact[];
  loading: boolean;
  onClose: () => void;
}

function contactStatusIcon(status: string) {
  switch (status) {
    case "sent": return <CheckCircle className="h-3.5 w-3.5 text-primary" />;
    case "delivered": return <CheckCircle className="h-3.5 w-3.5 text-blue-500" />;
    case "read": return <Eye className="h-3.5 w-3.5 text-blue-600" />;
    case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
    case "sending": return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />;
    default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

export function CampaignDetailsDialog({ campaign, contacts, loading, onClose }: CampaignDetailsDialogProps) {
  return (
    <Dialog open={!!campaign} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign?.name}</DialogTitle>
          <DialogDescription>Detalhes e status dos contatos da campanha</DialogDescription>
        </DialogHeader>

        {campaign && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <p className="text-lg font-bold text-foreground">{campaign.total_contacts}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="text-center p-3 bg-primary/5 rounded-lg">
                <p className="text-lg font-bold text-primary">{campaign.sent_count}</p>
                <p className="text-xs text-muted-foreground">Enviadas</p>
              </div>
              <div className="text-center p-3 bg-blue-500/5 rounded-lg">
                <p className="text-lg font-bold text-blue-600">{campaign.delivered_count}</p>
                <p className="text-xs text-muted-foreground">Entregues</p>
              </div>
              <div className="text-center p-3 bg-blue-600/5 rounded-lg">
                <p className="text-lg font-bold text-blue-700">{campaign.read_count}</p>
                <p className="text-xs text-muted-foreground">Lidas</p>
              </div>
              <div className="text-center p-3 bg-destructive/5 rounded-lg">
                <p className="text-lg font-bold text-destructive">{campaign.failed_count}</p>
                <p className="text-xs text-muted-foreground">Falhas</p>
              </div>
            </div>

            <div className="p-3 bg-muted/30 rounded-lg border">
              <p className="text-xs text-muted-foreground mb-1">Mensagem:</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{campaign.message_template}</p>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Enviado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{c.phone}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {contactStatusIcon(c.status)}
                            <span className="text-xs capitalize">{c.status}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.sent_at ? format(new Date(c.sent_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
