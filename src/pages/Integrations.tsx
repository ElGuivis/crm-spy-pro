import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Search, RefreshCw, Loader2, Plug, Mail, Trash2, Edit, MoreVertical, CheckCircle2, XCircle, AlertCircle, Settings, Store, Palette, Star, Instagram } from "lucide-react";
import { getIntegrationLogoUrl } from "@/lib/integration-logos";
import { Button } from "@/components/ui/button";
import { AddIntegrationDialog } from "@/components/integrations/AddIntegrationDialog";
import { EvolutionWhatsAppDialog } from "@/components/integrations/EvolutionWhatsAppDialog";
import { EmailIntegrationDialog } from "@/components/integrations/EmailIntegrationDialog";
import { TestEmailButton } from "@/components/integrations/TestEmailButton";
import { AIProviderIntegrationDialog } from "@/components/integrations/AIProviderIntegrationDialog";
import { MelhorEnvioDialog } from "@/components/integrations/MelhorEnvioDialog";
import { BlingConnectionDialog } from "@/components/integrations/BlingConnectionDialog";
import { BlingConfigDialog } from "@/components/integrations/BlingConfigDialog";
import { supabase } from "@/integrations/supabase/client";
import { InstagramIntegrationPanel } from "@/components/instagram/InstagramIntegrationPanel";
import { toast } from "sonner";
import { useMelhorEnvio } from "@/hooks/useMelhorEnvio";
import { useIntegrationStatusChecker } from "@/hooks/useIntegrationStatusChecker";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { createLogger } from '@/lib/logger';
const log = createLogger('Integrations');

interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
  last_sync_at: string | null;
  error_message: string | null;
  created_at: string;
  metadata?: unknown;
}

interface EmailIntegration {
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

const getIntegrationLogo = (type: string): string => {
  return getIntegrationLogoUrl(type);
};

const getIntegrationDescription = (type: string): string => {
  const descriptions: Record<string, string> = {
    loja_integrada: "Sincronização de pedidos, produtos e clientes",
    evolution_whatsapp: "Conexão WhatsApp via Evolution API",
    ai_openai: "Modelos GPT com sua própria API key",
    ai_google: "Modelos Gemini com sua própria API key",
    ai_groq: "Llama 3.1 ultra-rápido e gratuito",
    ai_mistral: "Modelos Mistral europeus com tier gratuito",
    melhor_envio: "Gestão de fretes e rastreamento de envios",
    instagram: "DMs, comentários e publicações automáticas",
    bling: "Sincronização de pedidos, produtos e estoque via ERP"
  };
  return descriptions[type] || "";
};

const getIntegrationIcon = (type: string) => {
  // All types now have real logos via getIntegrationLogo
  // This is a fallback only for types without logos
  if (type === "evolution_whatsapp") return "💬";
  if (type.startsWith("ai_")) return "🤖";
  if (type === "melhor_envio") return "📦";
  if (type === "bling") return "📊";
  if (type === "bling") return "📊";
  return "🛒";
};

const getStatusBadge = (status: string, isChecking?: boolean) => {
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

const IntegrationsPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [evolutionDialogOpen, setEvolutionDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [aiProviderDialogOpen, setAiProviderDialogOpen] = useState(false);
  const [melhorEnvioDialogOpen, setMelhorEnvioDialogOpen] = useState(false);
  const [melhorEnvioDialogMode, setMelhorEnvioDialogMode] = useState<'manage' | 'connect'>('manage');
  const [blingDialogOpen, setBlingDialogOpen] = useState(false);
  const [blingDialogMode, setBlingDialogMode] = useState<'manage' | 'connect'>('manage');
  const [blingConfigDialogOpen, setBlingConfigDialogOpen] = useState(false);
  const [selectedBlingIntegration, setSelectedBlingIntegration] = useState<Integration | null>(null);
  const [evolutionReconnectIntegration, setEvolutionReconnectIntegration] = useState<Integration | null>(null);
  const [selectedAIProvider, setSelectedAIProvider] = useState<'openai' | 'google' | 'groq' | 'mistral'>('openai');
  const [editingEmailIntegration, setEditingEmailIntegration] = useState<EmailIntegration | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [emailIntegrations, setEmailIntegrations] = useState<EmailIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<string | null>(null);
  const [emailDeleteDialogOpen, setEmailDeleteDialogOpen] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);
  const [defaultAIProvider, setDefaultAIProvider] = useState<string | null>(null);

  // Melhor Envio hook
  const { status: melhorEnvioStatus } = useMelhorEnvio();

  // Auth context for tenant
  const { tenantId } = useAuth();

  // Integration status checker
  const { statuses: integrationStatuses, checkAllIntegrations } = useIntegrationStatusChecker();

  // Check for OAuth callbacks on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const blingSuccess = params.get("bling_success");
    const igSuccess = params.get("ig_success");
    const igError = params.get("ig_error");
    
    if (blingSuccess) {
      toast.success("Bling conectado com sucesso!");
      window.history.replaceState({}, '', '/integrations');
    }
    if (igSuccess) {
      toast.success("Instagram conectado com sucesso!");
      window.history.replaceState({}, '', '/integrations');
    }
    if (igError) {
      const errorMessages: Record<string, string> = {
        token_exchange_failed: "Falha ao trocar o código de autorização",
        long_lived_token_failed: "Falha ao obter token de longa duração",
        no_instagram_account: "Nenhuma conta profissional do Instagram encontrada",
        save_failed: "Erro ao salvar a conexão",
        missing_params: "Parâmetros ausentes no retorno",
        unexpected: "Erro inesperado",
      };
      toast.error(errorMessages[igError] || `Erro na conexão: ${igError}`);
      window.history.replaceState({}, '', '/integrations');
    }
  }, []);

  // Atualizar lista de integrações quando Melhor Envio conectar
  useEffect(() => {
    if (melhorEnvioStatus?.connected) {
      fetchIntegrations();
    }
  }, [melhorEnvioStatus?.connected]);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("id, name, type, status, last_sync_at, error_message, created_at, metadata")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setIntegrations(data || []);

      // Check real status for all integrations via their APIs
      if (data && data.length > 0 && tenantId) {
        checkAllIntegrations(data, tenantId);
      }
    } catch (error) {
      log.error("Error fetching integrations:", error);
      toast.error("Erro ao carregar integrações");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmailIntegrations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-smtp", {
        body: { action: "get" },
      });

      if (error) throw error;
      setEmailIntegrations(data?.data || []);
    } catch (error) {
      log.error("Error fetching email integrations:", error);
    }
  };

  useEffect(() => {
    fetchIntegrations();
    fetchEmailIntegrations();
    fetchDefaultAI();
  }, []);

  const fetchDefaultAI = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase.functions.invoke('ai-default-provider', {
        body: { action: 'get' },
      });
      if (error) throw error;
      setDefaultAIProvider(data?.provider || null);
    } catch (err) {
      log.error("Error fetching default AI:", err);
    }
  };

  const handleEditEmailIntegration = (integration: EmailIntegration) => {
    setEditingEmailIntegration(integration);
    setEmailDialogOpen(true);
  };

  const handleDeleteEmailClick = (id: string) => {
    setEmailToDelete(id);
    setEmailDeleteDialogOpen(true);
  };

  const handleConfirmEmailDelete = async () => {
    if (!emailToDelete) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("manage-smtp", {
        body: { action: "delete", id: emailToDelete },
      });

      if (error) throw error;

      toast.success("Integração de e-mail removida!");
      await fetchEmailIntegrations();
    } catch (error) {
      log.error("Error deleting email integration:", error);
      toast.error("Erro ao remover integração de e-mail");
    } finally {
      setEmailDeleteDialogOpen(false);
      setEmailToDelete(null);
    }
  };

  const handleDeleteClick = (integrationId: string) => {
    setIntegrationToDelete(integrationId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!integrationToDelete) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("manage-sync-jobs", {
        body: { action: "delete-integration", integration_id: integrationToDelete },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao remover");

      toast.success("Integração removida com sucesso!");
      await fetchIntegrations();
    } catch (error) {
      log.error("Error deleting integration:", error);
      toast.error("Erro ao remover integração");
    } finally {
      setDeleteDialogOpen(false);
      setIntegrationToDelete(null);
    }
  };

  const handleSetDefaultAI = async (integration: Integration) => {
    if (!tenantId) return;
    const provider = integration.type.replace('ai_', '');
    try {
      const { data, error } = await supabase.functions.invoke('ai-default-provider', {
        body: { action: 'set', provider },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDefaultAIProvider(provider);
      toast.success(`${integration.name} definida como IA padrão`);
    } catch (error) {
      log.error("Error setting default AI:", error);
      toast.error("Erro ao definir IA padrão");
    }
  };

  // Filter by search
  const filteredIntegrations = searchQuery
    ? integrations.filter(i => 
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        getIntegrationDescription(i.type).toLowerCase().includes(searchQuery.toLowerCase())
      )
    : integrations;

  const filteredEmailIntegrations = searchQuery
    ? emailIntegrations.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sender_email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emailIntegrations;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Integrações</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas conexões e plataformas</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline" 
            size="icon"
            onClick={() => {
              fetchIntegrations();
              fetchEmailIntegrations();
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button variant="whatsapp" className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova Integração
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar integrações..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Instagram Channel */}
      <div data-ig-panel>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Instagram className="h-5 w-5 text-pink-500" />
          Instagram
        </h2>
        <InstagramIntegrationPanel />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredIntegrations.length === 0 && filteredEmailIntegrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Plug className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma integração configurada</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Adicione sua primeira integração para começar a sincronizar dados.
          </p>
          <Button variant="whatsapp" className="mt-4 gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar Integração
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Integration Cards */}
          {filteredIntegrations.map((integration) => (
            <Card key={integration.id} className="card-premium group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl">
                      {getIntegrationLogo(integration.type) ? (
                        <img 
                          src={getIntegrationLogo(integration.type)} 
                          alt={integration.name}
                          className="h-6 w-6 object-contain"
                        />
                      ) : (
                        getIntegrationIcon(integration.type)
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{integration.name}</CardTitle>
                        {integration.type.startsWith("ai_") && defaultAIProvider === integration.type.replace('ai_', '') && (
                          <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                            <Star className="h-2.5 w-2.5 fill-current" />
                            Padrão
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs">
                        {getIntegrationDescription(integration.type)}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {integration.type === "bling" && (
                        <>
                          <DropdownMenuItem onClick={() => {
                            setSelectedBlingIntegration(integration);
                            setBlingConfigDialogOpen(true);
                          }}>
                            <Palette className="h-4 w-4 mr-2" />
                            Configurações de exibição
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setBlingDialogMode('manage');
                            setBlingDialogOpen(true);
                          }}>
                            <Settings className="h-4 w-4 mr-2" />
                            Gerenciar conexão
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setBlingDialogMode('connect');
                            setBlingDialogOpen(true);
                          }}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reconectar
                          </DropdownMenuItem>
                        </>
                      )}
                      {integration.type === "evolution_whatsapp" && (
                        <DropdownMenuItem onClick={() => {
                          setEvolutionReconnectIntegration(integration);
                          setEvolutionDialogOpen(true);
                        }}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reconectar WhatsApp
                        </DropdownMenuItem>
                      )}
                      {integration.type === "loja_integrada" && (
                        <DropdownMenuItem onClick={() => setDialogOpen(true)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reconectar
                        </DropdownMenuItem>
                      )}
                      {integration.type === "melhor_envio" && (
                        <DropdownMenuItem onClick={() => {
                          setMelhorEnvioDialogMode('connect');
                          setMelhorEnvioDialogOpen(true);
                        }}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reconectar
                        </DropdownMenuItem>
                      )}
                      {integration.type.startsWith("ai_") && (
                        <>
                          <DropdownMenuItem onClick={() => {
                            const provider = integration.type.replace('ai_', '') as 'openai' | 'google' | 'groq' | 'mistral';
                            setSelectedAIProvider(provider);
                            setAiProviderDialogOpen(true);
                          }}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reconectar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSetDefaultAI(integration)}>
                            <Star className="h-4 w-4 mr-2" />
                            Tornar IA padrão
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem 
                        onClick={() => handleDeleteClick(integration.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  {integrationStatuses[integration.id] ? (
                    getStatusBadge(
                      integrationStatuses[integration.id].isConnected ? 'connected' : 'disconnected',
                      integrationStatuses[integration.id].isChecking
                    )
                  ) : (
                    getStatusBadge(integration.status, true)
                  )}
                  {integration.last_sync_at && (
                    <span className="text-xs text-muted-foreground">
                      Sync: {new Date(integration.last_sync_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
                {integration.error_message && (
                  <p className="mt-2 text-xs text-destructive line-clamp-2">
                    {integration.error_message}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Email Integration Cards */}
          {filteredEmailIntegrations.map((email) => (
            <Card key={email.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                      <Mail className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{email.name}</CardTitle>
                      <CardDescription className="text-xs">{email.sender_email}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditEmailIntegration(email)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDeleteEmailClick(email.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="font-mono">
                      {email.smtp_host}:{email.smtp_port}
                    </Badge>
                    <Badge variant={email.is_active ? "default" : "outline"}>
                      {email.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <TestEmailButton emailIntegrationId={email.id} disabled={!email.is_active} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <AddIntegrationDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          fetchIntegrations();
          fetchEmailIntegrations();
        }}
        onSelectEvolution={() => setEvolutionDialogOpen(true)}
        onSelectEmail={() => {
          setEditingEmailIntegration(null);
          setEmailDialogOpen(true);
        }}
        onSelectAIProvider={(provider) => {
          setSelectedAIProvider(provider);
          setAiProviderDialogOpen(true);
        }}
        onSelectMelhorEnvio={() => {
          setMelhorEnvioDialogMode('connect');
          setMelhorEnvioDialogOpen(true);
        }}
        onSelectBling={() => {
          setBlingDialogMode('connect');
          setBlingDialogOpen(true);
        }}
        onSelectInstagram={() => {
          // Scroll to Instagram section - the panel handles its own connect flow
          const igSection = document.querySelector('[data-ig-panel]');
          igSection?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <EvolutionWhatsAppDialog
        open={evolutionDialogOpen}
        onOpenChange={(open) => {
          setEvolutionDialogOpen(open);
          if (!open) setEvolutionReconnectIntegration(null);
        }}
        onSuccess={fetchIntegrations}
        reconnectIntegration={evolutionReconnectIntegration}
      />

      <EmailIntegrationDialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          setEmailDialogOpen(open);
          if (!open) setEditingEmailIntegration(null);
        }}
        integration={editingEmailIntegration}
        onSuccess={fetchEmailIntegrations}
      />

      <MelhorEnvioDialog
        open={melhorEnvioDialogOpen}
        onOpenChange={(open) => {
          setMelhorEnvioDialogOpen(open);
          if (!open) fetchIntegrations();
        }}
        mode={melhorEnvioDialogMode}
      />

      <BlingConnectionDialog
        open={blingDialogOpen}
        onOpenChange={setBlingDialogOpen}
        mode={blingDialogMode}
        onSuccess={fetchIntegrations}
      />

      {selectedBlingIntegration && (
        <BlingConfigDialog
          open={blingConfigDialogOpen}
          onOpenChange={(open) => {
            setBlingConfigDialogOpen(open);
            if (!open) setSelectedBlingIntegration(null);
          }}
          integrationId={selectedBlingIntegration.id}
          integrationName={selectedBlingIntegration.name}
        />
      )}

      <AIProviderIntegrationDialog
        open={aiProviderDialogOpen}
        onOpenChange={setAiProviderDialogOpen}
        provider={selectedAIProvider}
        existingIntegration={integrations.find(i => i.type === `ai_${selectedAIProvider}`) || undefined}
        onSuccess={fetchIntegrations}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A integração será removida e você precisará configurá-la novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={emailDeleteDialogOpen} onOpenChange={setEmailDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração de e-mail?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As credenciais SMTP serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmEmailDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default IntegrationsPage;
