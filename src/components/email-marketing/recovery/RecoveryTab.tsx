import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useMarketingSettings, useWaitlistPanel } from "@/hooks/useLiMarketing";
import { RECOVERY_KINDS } from "@/lib/recovery";
import { RecoverySummary } from "./RecoverySummary";
import { FlowEditor } from "./FlowEditor";
import { CapturedList } from "./CapturedList";
import { NativePanel } from "./NativePanel";
import { GroupsCard } from "./GroupsCard";
import { NewsletterPanel } from "./NewsletterPanel";
import { WaitlistPanel } from "./WaitlistPanel";

/** Aba "Recuperação": resultado, os fluxos (carrinho, navegação, pedido, boas-vindas), abandonos capturados, reposição, newsletter e a Loja Integrada (automação nativa, grupos). */
export function RecoveryTab() {
  const { data: waitlist } = useWaitlistPanel();
  const { settings } = useMarketingSettings();
  const restocked = settings.waitlist_alert ? (waitlist ?? []).filter((r) => r.restocked).length : 0;
  return (
    <Tabs defaultValue="summary" className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="summary">Resultado</TabsTrigger>
        {RECOVERY_KINDS.map((k) => <TabsTrigger key={k.kind} value={k.kind}>{k.short}</TabsTrigger>)}
        <TabsTrigger value="captured">Capturados</TabsTrigger>
        <TabsTrigger value="waitlist" className="gap-2">Reposição{restocked > 0 && <Badge className="px-1.5 text-xs bg-emerald-600">{restocked}</Badge>}</TabsTrigger>
        <TabsTrigger value="newsletter">Newsletter</TabsTrigger>
        <TabsTrigger value="store">Loja Integrada</TabsTrigger>
      </TabsList>
      <TabsContent value="summary"><RecoverySummary /></TabsContent>
      {RECOVERY_KINDS.map((k) => <TabsContent key={k.kind} value={k.kind}><FlowEditor kind={k.kind} /></TabsContent>)}
      <TabsContent value="captured"><CapturedList /></TabsContent>
      <TabsContent value="waitlist"><WaitlistPanel /></TabsContent>
      <TabsContent value="newsletter"><NewsletterPanel /></TabsContent>
      <TabsContent value="store" className="space-y-4"><NativePanel /><GroupsCard /></TabsContent>
    </Tabs>
  );
}
