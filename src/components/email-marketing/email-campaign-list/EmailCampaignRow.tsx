import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical, Edit, Copy, Archive, Trash2, Calendar, Eye, TestTube, Send, Loader2, FlaskConical,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EmailCampaign } from "@/hooks/useEmailCampaigns";
import { statusConfig, typeLabels } from "./emailCampaignListConfig";

export interface RowActions {
  onReview: (c: EmailCampaign) => void;
  onTest: (c: EmailCampaign) => void;
  onSchedule: (c: EmailCampaign) => void;
  onSend: (c: EmailCampaign) => void;
  onDetails: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (c: EmailCampaign) => void;
  onAbTest: (c: EmailCampaign) => void;
  onArchive: (c: EmailCampaign) => void;
  onDelete: (c: EmailCampaign) => void;
}

interface Props {
  campaign: EmailCampaign;
  isActing: boolean;
  pendingAction: string | null;
  actions: RowActions;
}

export function EmailCampaignRow({ campaign, isActing, pendingAction, actions }: Props) {
  const sc = statusConfig[campaign.status] || { label: campaign.status, className: "bg-secondary text-secondary-foreground" };

  return (
    <TableRow className={isActing ? "opacity-60" : ""}>
      <TableCell className="font-medium max-w-[200px]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate">{campaign.internal_name}</span>
          {campaign.ab_test_id && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 text-purple-700 bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:bg-purple-950/30 shrink-0">
              {campaign.ab_variant ?? "A/B"}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="max-w-[200px] truncate">{campaign.subject}</TableCell>
      <TableCell>
        <Badge variant="outline">{typeLabels[campaign.campaign_type] || campaign.campaign_type}</Badge>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium truncate max-w-[120px]">{campaign.sender_name}</div>
          <div className="text-muted-foreground text-xs truncate max-w-[140px]">{campaign.sender_email}</div>
        </div>
      </TableCell>
      <TableCell>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sc.className}`}>
          {campaign.status === "sending" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
          {sc.label}
        </span>
      </TableCell>
      <TableCell>
        {campaign.scheduled_at ? (
          <div className="flex items-center gap-1.5 text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span>{format(new Date(campaign.scheduled_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {format(new Date(campaign.updated_at), "dd/MM/yy", { locale: ptBR })}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isActing}>
              {isActing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {["draft", "scheduled", "error"].includes(campaign.status) && (
              <>
                <DropdownMenuItem onClick={() => actions.onReview(campaign)}>
                  <Eye className="h-4 w-4 mr-2" />Revisar e Enviar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => actions.onTest(campaign)}>
                  <TestTube className="h-4 w-4 mr-2" />Enviar Teste
                </DropdownMenuItem>
                {["draft", "error"].includes(campaign.status) && (
                  <DropdownMenuItem onClick={() => actions.onSchedule(campaign)}>
                    <Calendar className="h-4 w-4 mr-2" />Agendar
                  </DropdownMenuItem>
                )}
                {campaign.status === "draft" && (
                  <DropdownMenuItem onClick={() => actions.onSend(campaign)}>
                    <Send className="h-4 w-4 mr-2 text-primary" />
                    <span className="text-primary font-medium">Enviar Agora</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {["sent", "sending", "error"].includes(campaign.status) && (
              <DropdownMenuItem onClick={() => actions.onDetails(campaign.id)}>
                <Eye className="h-4 w-4 mr-2" />Ver Detalhes
              </DropdownMenuItem>
            )}
            {["draft", "scheduled", "error", "paused"].includes(campaign.status) && (
              <DropdownMenuItem onClick={() => actions.onEdit(campaign.id)}>
                <Edit className="h-4 w-4 mr-2" />Editar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => actions.onDuplicate(campaign)} disabled={!!pendingAction}>
              <Copy className="h-4 w-4 mr-2" />Duplicar
            </DropdownMenuItem>
            {campaign.status === "draft" && !campaign.ab_test_id && (
              <DropdownMenuItem onClick={() => actions.onAbTest(campaign)}>
                <FlaskConical className="h-4 w-4 mr-2 text-purple-600" />
                <span className="text-purple-700 dark:text-purple-400">Criar Teste A/B</span>
              </DropdownMenuItem>
            )}
            {campaign.status !== "sending" && (
              <DropdownMenuItem onClick={() => actions.onArchive(campaign)}>
                <Archive className="h-4 w-4 mr-2" />Arquivar
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {campaign.status !== "sending" && (
              <DropdownMenuItem onClick={() => actions.onDelete(campaign)} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
