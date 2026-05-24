import { Plus, Search, RefreshCw, Loader2, Plug, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstagramIntegrationPanel } from "@/components/instagram/InstagramIntegrationPanel";
import { useIntegrationsPage } from "@/hooks/useIntegrationsPage";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { EmailIntegrationCard } from "@/components/integrations/EmailIntegrationCard";
import { IntegrationsPageDialogs } from "@/components/integrations/IntegrationsPageDialogs";

const IntegrationsPage = () => {
  const page = useIntegrationsPage();

  const scrollToInstagram = () => {
    const igSection = document.querySelector("[data-ig-panel]");
    igSection?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Integrações</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas conexões e plataformas</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline" size="icon"
            onClick={() => { page.fetchIntegrations(); page.fetchEmailIntegrations(); }}
            disabled={page.isLoading}
          >
            {page.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="whatsapp" className="gap-2" onClick={() => page.setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova Integração
          </Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar integrações..."
          value={page.searchQuery}
          onChange={(e) => page.setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <div data-ig-panel>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Instagram className="h-5 w-5 text-pink-500" />
          Instagram
        </h2>
        <InstagramIntegrationPanel />
      </div>

      {page.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : page.filteredIntegrations.length === 0 && page.filteredEmailIntegrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
            <Plug className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma integração configurada</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            Adicione sua primeira integração para começar a sincronizar dados.
          </p>
          <Button variant="whatsapp" className="mt-4 gap-2" onClick={() => page.setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar Integração
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.filteredIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              defaultAIProvider={page.defaultAIProvider}
              statusInfo={page.integrationStatuses[integration.id]}
              actions={{
                onSyncAll: page.handleSyncAll,
                onSetDefaultAI: page.handleSetDefaultAI,
                onDelete: (id) => { page.setIntegrationToDelete(id); page.setDeleteDialogOpen(true); },
                onBlingConfig: (i) => { page.setSelectedBlingIntegration(i); page.setBlingConfigDialogOpen(true); },
                onBlingManage: () => { page.setBlingDialogMode("manage"); page.setBlingDialogOpen(true); },
                onBlingReconnect: () => { page.setBlingDialogMode("connect"); page.setBlingDialogOpen(true); },
                onEvolutionReconnect: (i) => { page.setEvolutionReconnectIntegration(i); page.setEvolutionDialogOpen(true); },
                onLojaIntegradaReconnect: () => page.setDialogOpen(true),
                onMelhorEnvioReconnect: () => { page.setMelhorEnvioDialogMode("connect"); page.setMelhorEnvioDialogOpen(true); },
                onNuvemshopManage: () => { page.setNuvemshopDialogMode("manage"); page.setNuvemshopDialogOpen(true); },
                onNuvemshopReconnect: () => { page.setNuvemshopDialogMode("connect"); page.setNuvemshopDialogOpen(true); },
                onAIReconnect: (provider) => { page.setSelectedAIProvider(provider); page.setAiProviderDialogOpen(true); },
              }}
            />
          ))}

          {page.filteredEmailIntegrations.map((email) => (
            <EmailIntegrationCard
              key={email.id}
              email={email}
              onEdit={(e) => { page.setEditingEmailIntegration(e); page.setEmailDialogOpen(true); }}
              onDelete={(id) => { page.setEmailToDelete(id); page.setEmailDeleteDialogOpen(true); }}
            />
          ))}
        </div>
      )}

      <IntegrationsPageDialogs page={page} onScrollToInstagram={scrollToInstagram} />
    </div>
  );
};

export default IntegrationsPage;
