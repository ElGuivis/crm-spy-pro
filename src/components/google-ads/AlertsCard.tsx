import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoogleAdsRecommendation } from "@/hooks/useGoogleAds";
import { SEVERITY_LABEL, SEVERITY_ORDER, asSeverity, type Severity } from "@/lib/googleAds";

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "bg-destructive text-destructive-foreground border-transparent",
  high: "bg-orange-500 text-white border-transparent",
  medium: "bg-yellow-500 text-black border-transparent",
  low: "bg-secondary text-secondary-foreground border-transparent",
};

/** Ação sugerida pelo agente (campo `payload.action`), se houver. */
function suggestedAction(rec: GoogleAdsRecommendation): string | null {
  const p = rec.payload;
  if (p && typeof p === "object" && !Array.isArray(p) && typeof (p as Record<string, unknown>).action === "string") {
    return (p as Record<string, string>).action;
  }
  return null;
}

export function AlertsCard({ alerts }: { alerts: GoogleAdsRecommendation[] }) {
  const sorted = [...alerts].sort(
    (a, b) => SEVERITY_ORDER[asSeverity(a.severity)] - SEVERITY_ORDER[asSeverity(b.severity)],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5" /> Alertas do diagnóstico
          {sorted.length > 0 && <Badge variant="outline">{sorted.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-green-600" /> Nenhum alerta no momento.
          </p>
        )}
        {sorted.map((rec) => {
          const sev = asSeverity(rec.severity);
          const action = suggestedAction(rec);
          return (
            <div key={rec.id} className="space-y-1 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge className={SEVERITY_CLASS[sev]}>{SEVERITY_LABEL[sev]}</Badge>
                <span className="font-medium">{rec.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{rec.rationale}</p>
              {action && <p className="text-sm"><span className="font-medium">O que fazer:</span> {action}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
