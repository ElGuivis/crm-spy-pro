import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Copy, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useExportCSV } from "@/hooks/useExportCSV";
import { fetchCampaignRecipients, recipientsToRows, RECIPIENT_HEADERS, SEGMENTS, type Segment } from "@/hooks/useCampaignRecipientsExport";
import { useAuth } from "@/contexts/AuthContext";
import { useResendToSegment } from "@/hooks/useResendToSegment";

const RESENDABLE: Segment[] = ["not_opened", "opened_not_clicked", "opened", "clicked"];

interface Props {
  campaignId: string;
  campaignName: string;
  counts: Partial<Record<Segment, number>>;
}

/** Baixa (CSV) ou copia a lista de e-mails de um segmento da campanha: abriram, clicaram, compraram etc. */
export function CampaignExportCard({ campaignId, campaignName, counts }: Props) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const { exportToCSV } = useExportCSV();
  const [segment, setSegment] = useState<Segment>("opened");
  const resend = useResendToSegment();
  const [busy, setBusy] = useState<"csv" | "copy" | null>(null);

  const run = async (mode: "csv" | "copy") => {
    if (!tenantId) return;
    setBusy(mode);
    try {
      const rows = await fetchCampaignRecipients(tenantId, campaignId, segment);
      if (mode === "csv") {
        const slug = campaignName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        await exportToCSV({ filename: `${slug || "campanha"}-${segment}`, headers: RECIPIENT_HEADERS, data: recipientsToRows(rows) });
      } else if (rows.length === 0) {
        toast({ title: "Nenhum e-mail", description: "Esse segmento está vazio.", variant: "destructive" });
      } else {
        await navigator.clipboard.writeText(rows.map((r) => r.email).join("\n"));
        toast({ title: "E-mails copiados", description: `${rows.length} e-mail(s) na área de transferência.` });
      }
    } catch (e) {
      toast({ title: "Erro ao exportar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Exportar lista de e-mails</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={segment} onValueChange={(v) => setSegment(v as Segment)}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEGMENTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}{counts[s.value] !== undefined ? ` (${counts[s.value]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-2" disabled={busy !== null} onClick={() => run("csv")}>
            {busy === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar CSV
          </Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={busy !== null} onClick={() => run("copy")}>
            {busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            Copiar e-mails
          </Button>
          {RESENDABLE.includes(segment) && (
            <Button size="sm" variant="secondary" className="gap-2" disabled={busy !== null || resend.isPending} onClick={() => resend.mutate({ campaignId, segment })}>
              {resend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Criar reenvio para este grupo
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {SEGMENTS.find((s) => s.value === segment)?.hint} O CSV inclui nome, aberturas, cliques, pedidos e receita de cada pessoa.
        </p>
      </CardContent>
    </Card>
  );
}
