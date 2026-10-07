import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMelhorEnvio } from "@/hooks/useMelhorEnvio";
import { useIntegrationStatusChecker } from "@/hooks/useIntegrationStatusChecker";
import { useAuth } from "@/contexts/AuthContext";
import { createLogger } from "@/lib/logger";
import type { Integration, EmailIntegration } from "@/components/integrations/integrationsHelpers";
import { getErrorMessage } from "@/lib/error-message";

const log = createLogger("useIntegrationsPage");

export type AIProvider = "openai" | "google" | "groq" | "mistral";
export type DialogMode = "manage" | "connect";

export function useIntegrationsPage() {
  const { tenantId, loading: authLoading } = useAuth();
  const { status: melhorEnvioStatus } = useMelhorEnvio();
  const { statuses: integrationStatuses, checkAllIntegrations } = useIntegrationStatusChecker();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [emailIntegrations, setEmailIntegrations] = useState<EmailIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [defaultAIProvider, setDefaultAIProvider] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [evolutionDialogOpen, setEvolutionDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [aiProviderDialogOpen, setAiProviderDialogOpen] = useState(false);
  const [melhorEnvioDialogOpen, setMelhorEnvioDialogOpen] = useState(false);
  const [melhorEnvioDialogMode, setMelhorEnvioDialogMode] = useState<DialogMode>("manage");
  const [blingDialogOpen, setBlingDialogOpen] = useState(false);
  const [blingDialogMode, setBlingDialogMode] = useState<DialogMode>("manage");
  const [blingConfigDialogOpen, setBlingConfigDialogOpen] = useState(false);
  const [selectedBlingIntegration, setSelectedBlingIntegration] = useState<Integration | null>(null);
  const [nuvemshopDialogOpen, setNuvemshopDialogOpen] = useState(false);
  const [nuvemshopDialogMode, setNuvemshopDialogMode] = useState<DialogMode>("manage");
  const [evolutionReconnectIntegration, setEvolutionReconnectIntegration] = useState<Integration | null>(null);
  const [selectedAIProvider, setSelectedAIProvider] = useState<AIProvider>("openai");
  const [editingEmailIntegration, setEditingEmailIntegration] = useState<EmailIntegration | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [integrationToDelete, setIntegrationToDelete] = useState<string | null>(null);
  const [emailDeleteDialogOpen, setEmailDeleteDialogOpen] = useState(false);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("id, name, type, status, last_sync_at, error_message, created_at, metadata")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setIntegrations(data || []);
      if (data && data.length > 0 && tenantId) checkAllIntegrations(data, tenantId);
    } catch (error) {
      log.error("Error fetching integrations:", error);
      toast.error("Erro ao carregar integrações");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchEmailIntegrations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-smtp", { body: { action: "get" } });
      if (error) throw error;
      setEmailIntegrations(data?.data || []);
    } catch (error) {
      log.error("Error fetching email integrations:", error);
    }
  };

  const fetchDefaultAI = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase.functions.invoke("ai-default-provider", { body: { action: "get" } });
      if (error) throw error;
      setDefaultAIProvider(data?.provider || null);
    } catch (err) {
      log.error("Error fetching default AI:", err);
    }
  };

  // OAuth callback handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handlers = [
      { key: "bling_success", msg: () => toast.success("Bling conectado com sucesso!") },
      { key: "ns_success", msg: () => { toast.success("Nuvemshop conectada com sucesso!"); fetchIntegrations(); } },
      { key: "ig_success", msg: () => toast.success("Instagram conectado com sucesso!") },
    ];
    const nsError = params.get("ns_error");
    const igError = params.get("ig_error");

    handlers.forEach(h => {
      if (params.get(h.key)) { h.msg(); window.history.replaceState({}, "", "/integrations"); }
    });

    if (nsError) {
      const map: Record<string, string> = {
        missing_params: "Parâmetros ausentes no retorno OAuth",
        invalid_state: "Sessão de autorização inválida ou expirada",
        state_expired: "Sessão de autorização expirou — tente novamente",
        token_exchange_failed: "Falha ao trocar código por token (verifique credenciais do app)",
        connection_save_failed: "Erro ao salvar a conexão",
        integration_save_failed: "Erro ao registrar a integração",
        server_misconfigured: "Servidor não configurado (NUVEMSHOP_APP_ID/SECRET ausentes)",
        internal: "Erro interno no callback",
      };
      toast.error(map[nsError] || `Erro ao conectar Nuvemshop: ${nsError}`);
      window.history.replaceState({}, "", "/integrations");
    }
    if (igError) {
      const map: Record<string, string> = {
        token_exchange_failed: "Falha ao trocar o código de autorização",
        long_lived_token_failed: "Falha ao obter token de longa duração",
        no_instagram_account: "Nenhuma conta profissional do Instagram encontrada",
        save_failed: "Erro ao salvar a conexão",
        missing_params: "Parâmetros ausentes no retorno",
        unexpected: "Erro inesperado",
      };
      toast.error(map[igError] || `Erro na conexão: ${igError}`);
      window.history.replaceState({}, "", "/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (melhorEnvioStatus?.connected) fetchIntegrations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [melhorEnvioStatus?.connected]);

  useEffect(() => {
    if (authLoading) return;
    fetchIntegrations();
    fetchEmailIntegrations();
    fetchDefaultAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  const handleSyncAll = async (integration: Integration) => {
    try {
      if (integration.type === "loja_integrada") {
        const { error } = await supabase.functions.invoke("li-sync", { body: { syncType: "all", integrationId: integration.id } });
        if (error) throw error;
        toast.success("Sincronização iniciada", { description: "Clientes, produtos e pedidos serão sincronizados em segundo plano. Acompanhe o progresso nas páginas correspondentes." });
      } else if (integration.type === "melhor_envio") {
        const { error } = await supabase.functions.invoke("melhor-envio", { body: { action: "sync_shipments" } });
        if (error) throw error;
        toast.success("Sincronização iniciada", { description: "Os envios serão sincronizados em segundo plano. Acompanhe o progresso na página Envios." });
      } else if (integration.type === "nuvemshop") {
        const { error } = await supabase.functions.invoke("nuvemshop-sync", { body: { integrationId: integration.id, syncType: "all" } });
        if (error) throw error;
        toast.success("Sincronização iniciada", { description: "Clientes, produtos e pedidos da Nuvemshop serão sincronizados em segundo plano." });
      } else {
        toast.error("Sincronização não suportada para este tipo de integração");
      }
    } catch (err) {
      const msg = err instanceof Error ? getErrorMessage(err) : "Falha ao iniciar sincronização";
      toast.error("Erro ao sincronizar", { description: msg });
    }
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

  const handleConfirmEmailDelete = async () => {
    if (!emailToDelete) return;
    try {
      const { error } = await supabase.functions.invoke("manage-smtp", { body: { action: "delete", id: emailToDelete } });
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

  const handleSetDefaultAI = async (integration: Integration) => {
    if (!tenantId) return;
    const provider = integration.type.replace("ai_", "");
    try {
      const { data, error } = await supabase.functions.invoke("ai-default-provider", { body: { action: "set", provider } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setDefaultAIProvider(provider);
      toast.success(`${integration.name} definida como IA padrão`);
    } catch (error) {
      log.error("Error setting default AI:", error);
      toast.error("Erro ao definir IA padrão");
    }
  };

  const filteredIntegrations = searchQuery
    ? integrations.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : integrations;

  const filteredEmailIntegrations = searchQuery
    ? emailIntegrations.filter(e =>
        e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.sender_email.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : emailIntegrations;

  return {
    isLoading, searchQuery, setSearchQuery,
    integrations, emailIntegrations, filteredIntegrations, filteredEmailIntegrations,
    defaultAIProvider, integrationStatuses,
    fetchIntegrations, fetchEmailIntegrations,
    handleSyncAll, handleSetDefaultAI, handleConfirmDelete, handleConfirmEmailDelete,
    dialogOpen, setDialogOpen,
    evolutionDialogOpen, setEvolutionDialogOpen,
    emailDialogOpen, setEmailDialogOpen,
    aiProviderDialogOpen, setAiProviderDialogOpen,
    melhorEnvioDialogOpen, setMelhorEnvioDialogOpen,
    melhorEnvioDialogMode, setMelhorEnvioDialogMode,
    blingDialogOpen, setBlingDialogOpen,
    blingDialogMode, setBlingDialogMode,
    blingConfigDialogOpen, setBlingConfigDialogOpen,
    selectedBlingIntegration, setSelectedBlingIntegration,
    nuvemshopDialogOpen, setNuvemshopDialogOpen,
    nuvemshopDialogMode, setNuvemshopDialogMode,
    evolutionReconnectIntegration, setEvolutionReconnectIntegration,
    selectedAIProvider, setSelectedAIProvider,
    editingEmailIntegration, setEditingEmailIntegration,
    deleteDialogOpen, setDeleteDialogOpen,
    integrationToDelete, setIntegrationToDelete,
    emailDeleteDialogOpen, setEmailDeleteDialogOpen,
    emailToDelete, setEmailToDelete,
  };
}
