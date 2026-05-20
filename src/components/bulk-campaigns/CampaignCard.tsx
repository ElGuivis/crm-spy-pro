import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Play, Pause, Trash2, Eye, Clock, CheckCircle, XCircle, Loader2, Coins, Users, Pencil, RotateCw, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Campaign } from "./types";

const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Rascunho", color: "bg-muted text-muted-foreground", icon: Clock },
  scheduled: { label: "Agendada", color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: Clock },
  processing: { label: "Enviando", color: "bg-primary/10 text-primary border-primary/20", icon: Loader2 },
  paused: { label: "Pausada", color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: Pause },
  completed: { label: "Concluída", color: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle },
  cancelled: { label: "Cancelada", color: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
};

interface CampaignCardProps {
  campaign: Campaign;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onView: (campaign: Campaign) => void;
  onDelete: (id: string) => void;
  onEdit?: (campaign: Campaign) => void;
  onRetryFailed?: (id: string) => void;
  onCreateABTest?: (campaign: Campaign) => void;
}

export function CampaignCard({ campaign, onStart, onPause, onView, onDelete, onEdit, onRetryFailed, onCreateABTest }: CampaignCardProps) {
  const st = statusLabels[campaign.status] || statusLabels.draft;
  const Icon = st.icon;
  const progress = campaign.total_contacts > 0
    ? Math.round(((campaign.sent_count + campaign.failed_count) / campaign.total_contacts) * 100)
    : 0;

  return (
    <div className="rounded-xl bg-card border border-border/50 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Send className="h-6 w-6" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h3 className="font-semibold text-card-foreground truncate">{campaign.name}</h3>
            {(campaign as { ab_test_id?: string | null }).ab_test_id && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-300 text-purple-700 bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:bg-purple-950/30 shrink-0">
                {(campaign as { ab_variant?: string | null }).ab_variant ?? "A/B"}
              </Badge>
            )}
            <Badge variant="outline" className={cn("text-xs", st.color)}>
              <Icon className={cn("h-3 w-3 mr-1", campaign.status === "processing" && "animate-spin")} />
              {st.label}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {campaign.total_contacts} contatos
            </span>
            <span className="flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />
              {campaign.total_tokens_used} tokens
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true, locale: ptBR })}
            </span>
          </div>
        </div>

        {(campaign.status === "processing" || campaign.status === "completed" || campaign.status === "paused") && (
          <div className="hidden md:flex flex-col items-end gap-1 min-w-[120px]">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-medium">{campaign.sent_count}</span>
              <span>/</span>
              <span>{campaign.total_contacts}</span>
              {campaign.failed_count > 0 && (
                <span className="text-destructive">({campaign.failed_count} falhas)</span>
              )}
            </div>
            <Progress value={progress} className="h-2 w-[120px]" />
          </div>
        )}

        <div className="flex items-center gap-1">
          {(campaign.status === "draft" || campaign.status === "paused") && (
            <Button size="sm" variant="default" className="gap-1" onClick={() => onStart(campaign.id)}>
              <Play className="h-3.5 w-3.5" />
              {campaign.status === "paused" ? "Retomar" : "Iniciar"}
            </Button>
          )}
          {campaign.status === "processing" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => onPause(campaign.id)}>
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
          )}
          {campaign.failed_count > 0 && campaign.status !== "processing" && onRetryFailed && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onRetryFailed(campaign.id)}
              title={`Reenviar ${campaign.failed_count} mensagem(ns) com falha`}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reenviar falhas
            </Button>
          )}
          {(campaign.status === "paused" || campaign.status === "draft") && onEdit && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(campaign)} title="Editar mensagem">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {campaign.status === "draft" && !(campaign as { ab_test_id?: string | null }).ab_test_id && onCreateABTest && (
            <Button size="sm" variant="ghost" title="Criar Teste A/B" onClick={() => onCreateABTest(campaign)}>
              <FlaskConical className="h-4 w-4 text-purple-600" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onView(campaign)}>
            <Eye className="h-4 w-4" />
          </Button>
          {campaign.status !== "processing" && (
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(campaign.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
