import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Loader2, Eye, EyeOff, ExternalLink, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

import { createLogger } from '@/lib/logger';
const log = createLogger('AIProviderIntegrationDialog');

type AIProvider = 'openai' | 'google' | 'groq' | 'mistral';

interface AIProviderIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: AIProvider;
  existingIntegration?: any | null;
  onSuccess: () => void;
}

const providerConfig: Record<AIProvider, {
  name: string;
  description: string;
  placeholder: string;
  helpUrl: string;
  helpText: string;
  testEndpoint: string;
  icon: string;
  freeInfo?: string;
}> = {
  openai: {
    name: "OpenAI (GPT)",
    description: "Configure sua API key da OpenAI para usar modelos GPT.",
    placeholder: "sk-...",
    helpUrl: "https://platform.openai.com/api-keys",
    helpText: "Obtenha sua API key em platform.openai.com → API Keys",
    testEndpoint: "https://api.openai.com/v1/models",
    icon: "🤖",
  },
  google: {
    name: "Google AI (Gemini)",
    description: "Configure sua API key do Google AI Studio para usar modelos Gemini.",
    placeholder: "AIza...",
    helpUrl: "https://aistudio.google.com/apikey",
    helpText: "Obtenha sua API key em aistudio.google.com → Get API Key",
    testEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    icon: "🔮",
    freeInfo: "15 req/min grátis, 1M tokens/mês",
  },
  groq: {
    name: "Groq (Llama 3.1)",
    description: "API ultra-rápida e gratuita com modelos Llama 3.1 e Mixtral.",
    placeholder: "gsk_...",
    helpUrl: "https://console.groq.com/keys",
    helpText: "Obtenha sua API key gratuita em console.groq.com",
    testEndpoint: "https://api.groq.com/openai/v1/models",
    icon: "⚡",
    freeInfo: "30 req/min grátis, 14.4K req/dia",
  },
  mistral: {
    name: "Mistral AI",
    description: "Modelos Mistral europeus com tier gratuito generoso.",
    placeholder: "...",
    helpUrl: "https://console.mistral.ai/api-keys",
    helpText: "Obtenha sua API key gratuita em console.mistral.ai",
    testEndpoint: "https://api.mistral.ai/v1/models",
    icon: "🌊",
    freeInfo: "1 req/seg grátis, modelos open-source",
  },
};

export function AIProviderIntegrationDialog({
  open,
  onOpenChange,
  provider,
  existingIntegration,
  onSuccess,
}: AIProviderIntegrationDialogProps) {
  const { tenantId } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    api_key: "",
  });

  const config = providerConfig[provider];

  useEffect(() => {
    if (existingIntegration) {
      setFormData({
        name: existingIntegration.name || "",
        api_key: "", // Don't show existing API key
      });
    } else {
      setFormData({
        name: config.name,
        api_key: "",
      });
    }
    setTestResult(null);
    setShowApiKey(false);
  }, [existingIntegration, open, provider, config.name]);

  const handleTestConnection = async () => {
    if (!formData.api_key) {
      toast.error("Insira uma API key para testar");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      let response: Response;
      
      if (provider === 'openai') {
        response = await fetch(config.testEndpoint, {
          headers: { 'Authorization': `Bearer ${formData.api_key}` },
        });
      } else if (provider === 'groq') {
        response = await fetch(config.testEndpoint, {
          headers: { 'Authorization': `Bearer ${formData.api_key}` },
        });
      } else if (provider === 'mistral') {
        response = await fetch(config.testEndpoint, {
          headers: { 'Authorization': `Bearer ${formData.api_key}` },
        });
      } else {
        // Google
        response = await fetch(`${config.testEndpoint}?key=${formData.api_key}`);
      }

      if (response.ok) {
        setTestResult('success');
        toast.success("Conexão bem sucedida!");
      } else {
        setTestResult('error');
        toast.error("API key inválida");
      }
    } catch (error) {
      log.error("Test connection error:", error);
      setTestResult('error');
      toast.error("Erro ao testar conexão");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clean the API key - remove whitespace and newlines
    const cleanedApiKey = formData.api_key.trim().replace(/[\s\n\r]/g, '');
    
    if (!cleanedApiKey && !existingIntegration) {
      toast.error("Insira a API key");
      return;
    }

    setIsLoading(true);

    try {
      if (cleanedApiKey) {
        // Use edge function for server-side encryption (never send btoa'd keys)
        const { data, error } = await supabase.functions.invoke('manage-credentials', {
          body: {
            action: 'save',
            provider,
            api_key: cleanedApiKey,
            name: formData.name,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      } else if (existingIntegration) {
        // Just updating the name, no key change
        await supabase
          .from("integrations")
          .update({ name: formData.name })
          .eq("id", existingIntegration.id);
      }

      toast.success(existingIntegration ? "Integração atualizada com sucesso!" : "Integração criada com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      log.error("Error saving AI integration:", error);
      toast.error(error.message || "Erro ao salvar integração");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {existingIntegration ? "Editar" : "Nova"} Integração {config.name}
          </DialogTitle>
          <DialogDescription>
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Integração</Label>
            <Input
              id="name"
              placeholder={`Ex: ${config.name}`}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="api_key">API Key</Label>
              <a
                href={config.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Obter API key
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="api_key"
                  type={showApiKey ? "text" : "password"}
                  placeholder={existingIntegration ? "••••••••••••••••" : config.placeholder}
                  value={formData.api_key}
                  onChange={(e) => {
                    setFormData({ ...formData, api_key: e.target.value });
                    setTestResult(null);
                  }}
                  className="pr-10"
                  required={!existingIntegration}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting || !formData.api_key}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : testResult === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : testResult === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  'Testar'
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {config.helpText}
            </p>
          </div>

          {/* Info box */}
          <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium">💡 Por que usar sua própria API key?</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Controle total sobre seus custos de IA</li>
              <li>Sem limites da plataforma</li>
              {config.freeInfo && (
                <li className="text-green-600 dark:text-green-400">
                  🎁 Tier gratuito: {config.freeInfo}
                </li>
              )}
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {existingIntegration ? "Salvar Alterações" : "Criar Integração"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
