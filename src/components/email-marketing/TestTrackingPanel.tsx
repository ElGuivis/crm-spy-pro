import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MousePointerClick, Eye } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  campaignId: string;
  since: string;
}

/** Mostra, em tempo real, se o rastreio do e-mail de TESTE funcionou: abra o e-mail e clique em um link. */
export function TestTrackingPanel({ campaignId, since }: Props) {
  const { data } = useQuery({
    queryKey: ["test-tracking", campaignId, since],
    refetchInterval: 4000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_events")
        .select("event_type, link_url, created_at")
        .eq("campaign_id", campaignId)
        .in("event_type", ["test_open", "test_click"])
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const open = data?.find((e) => e.event_type === "test_open");
  const click = data?.find((e) => e.event_type === "test_click");
  const row = (done: boolean, icon: React.ReactNode, text: string, at?: string) => (
    <div className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {icon}
      <span className={done ? "" : "text-muted-foreground"}>{text}</span>
      {at && <span className="ml-auto text-xs text-muted-foreground">{format(new Date(at), "HH:mm:ss")}</span>}
    </div>
  );

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="text-sm font-medium">Rastreio do teste</p>
      <p className="text-xs text-muted-foreground">
        Abra o e-mail na sua caixa de entrada e clique em um link. Aberturas e cliques do teste não entram nas métricas da campanha.
      </p>
      {row(!!open, <Eye className="h-4 w-4" />, open ? "Abertura detectada" : "Aguardando você abrir o e-mail…", open?.created_at)}
      {row(!!click, <MousePointerClick className="h-4 w-4" />, click ? `Clique detectado${click.link_url ? `: ${click.link_url}` : ""}` : "Aguardando você clicar em um link…", click?.created_at)}
    </div>
  );
}
