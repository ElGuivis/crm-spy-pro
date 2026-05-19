import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, MessageCircle, Star, Phone, Mail, ShoppingBag, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ClientLoyaltyPanel } from "./ClientLoyaltyPanel";

interface NsCustomer {
  id: string;
  integration_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  doc: string | null;
  total_spent: number | null;
  total_orders: number | null;
}

interface NuvemshopClientDetailsDialogProps {
  client: NsCustomer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuvemshopClientDetailsDialog({ client, open, onOpenChange }: NuvemshopClientDetailsDialogProps) {
  const { toast } = useToast();

  const { data: rfm } = useQuery({
    queryKey: ["ns-client-rfm", client?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("customer_rfm_snapshots")
        .select("segment_name")
        .eq("customer_id", client!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!client?.id && open,
  });

  if (!client) return null;

  const fmt = (v: number | null) =>
    v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
  const initials = (name: string | null) =>
    name ? name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "??";

  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} copiado` }));

  const openWhatsApp = () => {
    const p = (client.phone || "").replace(/\D/g, "");
    if (p) window.open(`https://wa.me/55${p}`, "_blank");
  };

  const RFM_COLORS: Record<string, string> = {
    Champions: "bg-yellow-100 text-yellow-800 border-yellow-300",
    "Loyal Customers": "bg-green-100 text-green-800 border-green-300",
    "Potential Loyalist": "bg-blue-100 text-blue-800 border-blue-300",
    "At Risk": "bg-orange-100 text-orange-800 border-orange-300",
    "Cant Lose Them": "bg-red-100 text-red-800 border-red-300",
  };
  const rfmColor = rfm?.segment_name ? (RFM_COLORS[rfm.segment_name] || "bg-muted text-muted-foreground") : "";
  const customerKey = client.phone || client.name || "";
  const integrationId = client.integration_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-600 font-semibold text-lg shrink-0">
              {initials(client.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-lg font-semibold">{client.name || "Sem nome"}</p>
                {rfm?.segment_name && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${rfmColor}`}>
                    {rfm.segment_name}
                  </span>
                )}
              </div>
              {client.doc && <p className="text-sm text-muted-foreground font-mono">{client.doc}</p>}
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Quick actions */}
        <div className="flex gap-2 flex-wrap -mt-1">
          {client.phone && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => copy(client.phone!, "Telefone")}>
                <Copy className="h-3 w-3" /> {client.phone}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={openWhatsApp}>
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </Button>
            </>
          )}
          {client.email && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => copy(client.email!, "E-mail")}>
              <Copy className="h-3 w-3" /> {client.email.length > 24 ? client.email.slice(0, 24) + "…" : client.email}
            </Button>
          )}
        </div>

        <Tabs defaultValue="perfil" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="pontos"><Star className="h-3.5 w-3.5 mr-1 text-yellow-500" />Pontos</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3 pr-2">
            {/* ── PERFIL ── */}
            <TabsContent value="perfil" className="mt-0 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><ShoppingBag className="h-4 w-4" /><span className="text-xs">Pedidos</span></div>
                  <p className="text-xl font-bold">{client.total_orders ?? 0}</p>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /><span className="text-xs">Total gasto</span></div>
                  <p className="text-xl font-bold text-green-600">{fmt(client.total_spent)}</p>
                </div>
              </div>
              <Separator />

              {/* Contato */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contato</h4>
                <div className="grid gap-1.5 text-sm">
                  {client.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 shrink-0" />
                      <a href={`mailto:${client.email}`} className="hover:text-foreground truncate">{client.email}</a>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" /><span>{client.phone}</span>
                    </div>
                  )}
                  {!client.email && !client.phone && (
                    <p className="text-muted-foreground/70 text-xs">Nenhuma informação de contato</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ── PONTOS ── */}
            <TabsContent value="pontos" className="mt-0">
              <ClientLoyaltyPanel integrationId={integrationId} customerExternalId={customerKey} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
