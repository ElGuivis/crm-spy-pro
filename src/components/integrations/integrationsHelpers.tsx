import { Loader2, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getIntegrationLogoUrl } from "@/lib/integration-logos";

export interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
  last_sync_at: string | null;
  error_message: string | null;
  created_at: string;
  metadata?: unknown;
}

export interface EmailIntegration {
  id: string;
  name: string;
  sender_email: string;
  sender_name?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  has_password: boolean;
  smtp_secure: boolean;
  smtp_tls: boolean;
  reply_to: string | null;
  is_active: boolean;
  created_at: string;
  daily_send_limit?: number | null;
  max_sends_per_second?: number | null;
}

export const getIntegrationLogo = (type: string): string => getIntegrationLogoUrl(type);

export const getIntegrationDescription = (type: string): string => {
  const descriptions: Record<string, string> = {
    loja_integrada: "Sincronização de pedidos, produtos e clientes",
    evolution_whatsapp: "Conexão WhatsApp via Evolution API",
    ai_openai: "Modelos GPT com sua própria API key",
    ai_google: "Modelos Gemini com sua própria API key",
    ai_groq: "Llama 3.1 ultra-rápido e gratuito",
    ai_mistral: "Modelos Mistral europeus com tier gratuito",
    melhor_envio: "Gestão de fretes e rastreamento de envios",
    instagram: "DMs, comentários e publicações automáticas",
    bling: "Sincronização de pedidos, produtos e estoque via ERP",
    nuvemshop: "Sincronização de pedidos, produtos e clientes da loja Nuvemshop",
  };
  return descriptions[type] || "";
};

export const getIntegrationIcon = (type: string) => {
  if (type === "evolution_whatsapp") return "💬";
  if (type.startsWith("ai_")) return "🤖";
  if (type === "melhor_envio") return "📦";
  if (type === "bling") return "📊";
  return "🛒";
};

export const getStatusBadge = (status: string, isChecking?: boolean) => {
  if (isChecking) {
    return (
      <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/20">
        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        Verificando
      </Badge>
    );
  }
  switch (status) {
    case "connected":
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Conectado
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
          <AlertCircle className="h-3 w-3 mr-1" />
          Pendente
        </Badge>
      );
    default:
      return (
        <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">
          <XCircle className="h-3 w-3 mr-1" />
          Desconectado
        </Badge>
      );
  }
};
