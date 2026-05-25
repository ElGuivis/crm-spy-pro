import type { EmailCampaignStatus } from "@/hooks/useEmailCampaigns";

export const statusConfig: Record<EmailCampaignStatus, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-secondary text-secondary-foreground" },
  scheduled: { label: "Agendada", className: "bg-primary/10 text-primary" },
  sending: { label: "Enviando…", className: "bg-primary/20 text-primary" },
  sent: { label: "Enviada", className: "bg-primary/10 text-primary" },
  paused: { label: "Pausada", className: "bg-secondary text-secondary-foreground" },
  canceled: { label: "Cancelada", className: "bg-destructive/10 text-destructive" },
  error: { label: "Erro", className: "bg-destructive/10 text-destructive" },
};

export const typeLabels: Record<string, string> = {
  newsletter: "Newsletter",
  promotion: "Promoção",
  relationship: "Relacionamento",
  automation: "Automação",
  update: "Atualização",
};
