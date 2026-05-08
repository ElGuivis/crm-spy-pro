import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Store, MessageSquare, Mail, Bot, Truck, Instagram } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getIntegrationBrand } from "@/lib/integration-logos";

import { createLogger } from '@/lib/logger';
const log = createLogger('AddIntegrationDialog');

interface AddIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onSelectEvolution?: () => void;
  onSelectEmail?: () => void;
  onSelectAIProvider?: (provider: 'openai' | 'google' | 'groq' | 'mistral') => void;
  onSelectMelhorEnvio?: () => void;
  onSelectBling?: () => void;
  onSelectInstagram?: () => void;
}

const availableIntegrations = [
  {
    id: "loja_integrada",
    name: "Loja Integrada",
    description: "Sincronização automática de pedidos, produtos e clientes",
    icon: Store,
    fields: [
      { name: "api_key", label: "API Key", placeholder: "Sua chave de API da Loja Integrada", type: "password" }
    ]
  },
  {
    id: "evolution_whatsapp",
    name: "Evolution WhatsApp",
    description: "Conexão WhatsApp via Evolution API para automações",
    icon: MessageSquare,
    fields: [],
    customFlow: true
  },
  {
    id: "email_smtp",
    name: "Disparo de E-mail",
    description: "Envio de e-mails via SMTP para automações",
    icon: Mail,
    fields: [],
    customFlow: true
  },
  {
    id: "ai_openai",
    name: "OpenAI (GPT)",
    description: "Use sua própria API key para modelos GPT",
    icon: Bot,
    fields: [],
    customFlow: true
  },
  {
    id: "ai_google",
    name: "Google AI (Gemini)",
    description: "Use sua própria API key para modelos Gemini - 15 req/min grátis",
    icon: Bot,
    fields: [],
    customFlow: true
  },
  {
    id: "ai_groq",
    name: "Groq (Llama 3.1)",
    description: "API ultra-rápida e gratuita - 30 req/min grátis",
    icon: Bot,
    fields: [],
    customFlow: true
  },
  {
    id: "ai_mistral",
    name: "Mistral AI",
    description: "Modelos europeus com tier gratuito - 1 req/seg grátis",
    icon: Bot,
    fields: [],
    customFlow: true
  },
  {
    id: "melhor_envio",
    name: "Melhor Envio",
    description: "Gestão de fretes e rastreamento de envios",
    icon: Truck,
    fields: [],
    customFlow: true
  },
  {
    id: "bling",
    name: "Bling ERP",
    description: "Sincronização de pedidos, produtos e estoque via ERP",
    icon: Store,
    fields: [],
    customFlow: true
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "DMs, comentários e automações via API oficial da Meta",
    icon: Instagram,
    fields: [],
    customFlow: true
  }
];

export function AddIntegrationDialog({ open, onOpenChange, onSuccess, onSelectEvolution, onSelectEmail, onSelectAIProvider, onSelectMelhorEnvio, onSelectBling, onSelectInstagram }: AddIntegrationDialogProps) {
  const { tenantId } = useAuth();
  const [step, setStep] = useState<"select" | "configure">("select");
  const [selectedIntegration, setSelectedIntegration] = useState<typeof availableIntegrations[0] | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectIntegration = (integration: typeof availableIntegrations[0]) => {
    // Check if this integration has a custom flow
    if (integration.customFlow) {
      onOpenChange(false);
      setTimeout(() => {
        if (integration.id === 'evolution_whatsapp') {
          onSelectEvolution?.();
        } else if (integration.id === 'email_smtp') {
          onSelectEmail?.();
        } else if (integration.id === 'ai_openai') {
          onSelectAIProvider?.('openai');
        } else if (integration.id === 'ai_google') {
          onSelectAIProvider?.('google');
        } else if (integration.id === 'ai_groq') {
          onSelectAIProvider?.('groq');
        } else if (integration.id === 'ai_mistral') {
          onSelectAIProvider?.('mistral');
        } else if (integration.id === 'melhor_envio') {
          onSelectMelhorEnvio?.();
        } else if (integration.id === 'bling') {
          onSelectBling?.();
        } else if (integration.id === 'instagram') {
          onSelectInstagram?.();
        }
      }, 100);
      return;
    }

    setSelectedIntegration(integration);
    setFormData({ name: integration.name });
    setStep("configure");
  };

  const handleBack = () => {
    setStep("select");
    setSelectedIntegration(null);
    setFormData({});
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("select");
      setSelectedIntegration(null);
      setFormData({});
    }, 200);
  };

  const handleSave = async () => {
    if (!selectedIntegration) return;

    // Validate required fields
    const missingFields = selectedIntegration.fields.filter(
      field => !formData[field.name]?.trim()
    );

    if (missingFields.length > 0) {
      toast.error(`Preencha o campo: ${missingFields[0].label}`);
      return;
    }

    setIsLoading(true);

    try {
      // Validate API key with edge function
      toast.info("Validando API Key...");
      
      const { data: validationResult, error: validationError } = await supabase.functions.invoke('li-validate', {
        body: { apiKey: formData.api_key }
      });

      if (validationError) {
        throw new Error('Erro ao validar API Key');
      }

      if (!validationResult?.valid) {
        toast.error(validationResult?.error || 'API Key inválida');
        setIsLoading(false);
        return;
      }

      // API key is valid, save integration as connected
      const { error } = await supabase.from("integrations").insert({
        name: formData.name?.trim() || selectedIntegration.name,
        type: selectedIntegration.id,
        api_key: formData.api_key,
        status: "connected",
        tenant_id: tenantId
      });

      if (error) throw error;

      toast.success("Integração conectada com sucesso!");
      onSuccess();
      handleClose();
    } catch (error) {
      log.error("Error adding integration:", error);
      toast.error("Erro ao adicionar integração");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        {step === "select" ? (
          <>
            <DialogHeader>
              <DialogTitle>Nova Integração</DialogTitle>
              <DialogDescription>
                Selecione a plataforma que deseja conectar
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4 max-h-[60vh] overflow-y-auto">
              {availableIntegrations.map((integration) => {
                const Icon = integration.icon;
                const brand = getIntegrationBrand(integration.id === 'meta' ? 'meta_facebook_instagram' : integration.id);
                return (
                  <button
                    key={integration.id}
                    onClick={() => handleSelectIntegration(integration)}
                    className="flex flex-col items-center text-center gap-3 p-4 sm:p-6 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${brand.color} overflow-hidden`}>
                      {brand.logo ? (
                        <img
                          src={brand.logo}
                          alt={integration.name}
                          className="h-8 w-8 object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                            (e.currentTarget.nextElementSibling as HTMLElement)?.style.removeProperty('display');
                          }}
                        />
                      ) : null}
                      <Icon className={`h-6 w-6 ${brand.logo ? 'hidden' : ''}`} style={brand.logo ? { display: 'none' } : undefined} />
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground">{integration.name}</h3>
                      <p className="text-sm text-muted-foreground max-w-[220px] mx-auto">{integration.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Configurar {selectedIntegration?.name}
              </DialogTitle>
              <DialogDescription>
                Insira suas credenciais para conectar
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome da Integração</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Ex: Minha Loja Principal"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              {selectedIntegration?.fields.map((field) => (
                <div key={field.name} className="grid gap-2">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  <Input
                    id={field.name}
                    type={field.type || "text"}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ""}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                A API Key pode ser encontrada no painel da Loja Integrada em Configurações → API.
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleBack} disabled={isLoading}>
                Voltar
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conectar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}