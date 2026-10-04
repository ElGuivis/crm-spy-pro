import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlaskConical, Loader2, Users } from "lucide-react";
import { useCreateABTest } from "@/hooks/useEmailCampaigns";

interface Props {
  campaignId: string;
  subjectA: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ABTestEmailDialog({ campaignId, subjectA, open, onOpenChange }: Props) {
  const [subjectB, setSubjectB] = useState("");
  const [splitPct, setSplitPct] = useState(50);
  const [auto, setAuto] = useState(true);
  const [testPct, setTestPct] = useState(20);
  const [hours, setHours] = useState(4);
  const createAB = useCreateABTest();

  const handleCreate = async () => {
    if (!subjectB.trim()) return;
    await createAB.mutateAsync({ campaignId, subjectB: subjectB.trim(), splitPct, autoWinner: auto ? { testPct, hours } : undefined });
    onOpenChange(false);
    setSubjectB("");
    setSplitPct(50);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Criar Teste A/B
          </DialogTitle>
          <DialogDescription>
            Teste dois assuntos diferentes na mesma audiência e descubra qual converte mais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Variante A — assunto atual</Label>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground truncate">
              {subjectA}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-b">Variante B — novo assunto</Label>
            <Input
              id="subject-b"
              placeholder="Ex: 🔥 Só hoje: 30% OFF para você"
              value={subjectB}
              onChange={e => setSubjectB(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Enviar o vencedor automaticamente</p>
              <p className="text-xs text-muted-foreground">Testa os dois assuntos em uma parte pequena da lista e manda o que tiver mais aberturas para todo o resto.</p>
            </div>
            <Switch checked={auto} onCheckedChange={setAuto} aria-label="Vencedor automático" />
          </div>

          {auto ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Tamanho do teste</Label>
                  <span className="text-sm font-medium text-primary">{testPct / 2}% recebe A · {testPct / 2}% recebe B</span>
                </div>
                <Slider min={10} max={50} step={5} value={[testPct]} onValueChange={([v]) => setTestPct(v)} className="w-full" />
                <p className="text-xs text-muted-foreground">Os outros {100 - testPct}% recebem o assunto vencedor.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Esperar quanto tempo antes de decidir</Label>
                <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
                  <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>{[2, 4, 8, 12, 24].map((h) => <SelectItem key={h} value={String(h)}>{h} horas depois do envio</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Envie A e B; quando o prazo passar, o sistema compara as aberturas e envia o vencedor sozinho.</p>
              </div>
            </div>
          ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Divisão da audiência
              </Label>
              <span className="text-sm font-medium text-primary">{splitPct}% A · {100 - splitPct}% B</span>
            </div>
            <Slider
              min={20} max={80} step={5}
              value={[splitPct]}
              onValueChange={([v]) => setSplitPct(v)}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Audiência dividida de forma determinística (por email, ordem alfabética).
            </p>
          </div>
          )}

          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
            <FlaskConical className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
              A Variante B será criada com o mesmo conteúdo de A. Você pode editar o corpo do email depois nas configurações de B.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!subjectB.trim() || createAB.isPending} className="gap-2">
            {createAB.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Criar Teste A/B
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
