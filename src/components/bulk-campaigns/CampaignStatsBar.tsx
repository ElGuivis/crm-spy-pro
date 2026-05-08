import { BarChart3, Send, CheckCircle, Coins } from "lucide-react";

interface Campaign {
  sent_count: number;
  delivered_count: number;
  total_tokens_used: number;
}

interface CampaignStatsBarProps {
  campaigns: Campaign[];
}

export function CampaignStatsBar({ campaigns }: CampaignStatsBarProps) {
  if (campaigns.length === 0) return null;

  const stats = [
    {
      icon: BarChart3,
      label: "Total",
      value: campaigns.length,
    },
    {
      icon: Send,
      label: "Enviadas",
      value: campaigns.reduce((a, c) => a + c.sent_count, 0),
    },
    {
      icon: CheckCircle,
      label: "Entregues",
      value: campaigns.reduce((a, c) => a + c.delivered_count, 0),
    },
    {
      icon: Coins,
      label: "Tokens Usados",
      value: campaigns.reduce((a, c) => a + c.total_tokens_used, 0),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl bg-card border border-border/50 p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <stat.icon className="h-4 w-4" />
            {stat.label}
          </div>
          <p className="text-2xl font-bold text-foreground">{stat.value.toLocaleString()}</p>
        </div>
      ))}
    </div>
  );
}
