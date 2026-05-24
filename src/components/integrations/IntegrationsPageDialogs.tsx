import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AddIntegrationDialog } from "./AddIntegrationDialog";
import { EvolutionWhatsAppDialog } from "./EvolutionWhatsAppDialog";
import { EmailIntegrationDialog } from "./EmailIntegrationDialog";
import { AIProviderIntegrationDialog } from "./AIProviderIntegrationDialog";
import { MelhorEnvioDialog } from "./MelhorEnvioDialog";
import { BlingConnectionDialog } from "./BlingConnectionDialog";
import { BlingConfigDialog } from "./BlingConfigDialog";
import { NuvemshopConnectionDialog } from "./NuvemshopConnectionDialog";
import type { useIntegrationsPage } from "@/hooks/useIntegrationsPage";

type Page = ReturnType<typeof useIntegrationsPage>;

interface Props {
  page: Page;
  onScrollToInstagram: () => void;
}

export function IntegrationsPageDialogs({ page, onScrollToInstagram }: Props) {
  return (
    <>
      <AddIntegrationDialog
        open={page.dialogOpen}
        onOpenChange={page.setDialogOpen}
        onSuccess={() => { page.fetchIntegrations(); page.fetchEmailIntegrations(); }}
        onSelectEvolution={() => page.setEvolutionDialogOpen(true)}
        onSelectEmail={() => { page.setEditingEmailIntegration(null); page.setEmailDialogOpen(true); }}
        onSelectAIProvider={(provider) => { page.setSelectedAIProvider(provider); page.setAiProviderDialogOpen(true); }}
        onSelectMelhorEnvio={() => { page.setMelhorEnvioDialogMode("connect"); page.setMelhorEnvioDialogOpen(true); }}
        onSelectBling={() => { page.setBlingDialogMode("connect"); page.setBlingDialogOpen(true); }}
        onSelectInstagram={onScrollToInstagram}
        onSelectNuvemshop={() => { page.setNuvemshopDialogMode("connect"); page.setNuvemshopDialogOpen(true); }}
      />

      <EvolutionWhatsAppDialog
        open={page.evolutionDialogOpen}
        onOpenChange={(open) => { page.setEvolutionDialogOpen(open); if (!open) page.setEvolutionReconnectIntegration(null); }}
        onSuccess={page.fetchIntegrations}
        reconnectIntegration={page.evolutionReconnectIntegration}
      />

      <EmailIntegrationDialog
        open={page.emailDialogOpen}
        onOpenChange={(open) => { page.setEmailDialogOpen(open); if (!open) page.setEditingEmailIntegration(null); }}
        integration={page.editingEmailIntegration}
        onSuccess={page.fetchEmailIntegrations}
      />

      <MelhorEnvioDialog
        open={page.melhorEnvioDialogOpen}
        onOpenChange={(open) => { page.setMelhorEnvioDialogOpen(open); if (!open) page.fetchIntegrations(); }}
        mode={page.melhorEnvioDialogMode}
      />

      <BlingConnectionDialog
        open={page.blingDialogOpen}
        onOpenChange={page.setBlingDialogOpen}
        mode={page.blingDialogMode}
        onSuccess={page.fetchIntegrations}
      />

      <NuvemshopConnectionDialog
        open={page.nuvemshopDialogOpen}
        onOpenChange={(open) => { page.setNuvemshopDialogOpen(open); if (!open) page.fetchIntegrations(); }}
        mode={page.nuvemshopDialogMode}
      />

      {page.selectedBlingIntegration && (
        <BlingConfigDialog
          open={page.blingConfigDialogOpen}
          onOpenChange={(open) => { page.setBlingConfigDialogOpen(open); if (!open) page.setSelectedBlingIntegration(null); }}
          integrationId={page.selectedBlingIntegration.id}
          integrationName={page.selectedBlingIntegration.name}
        />
      )}

      <AIProviderIntegrationDialog
        open={page.aiProviderDialogOpen}
        onOpenChange={page.setAiProviderDialogOpen}
        provider={page.selectedAIProvider}
        existingIntegration={page.integrations.find(i => i.type === `ai_${page.selectedAIProvider}`) || undefined}
        onSuccess={page.fetchIntegrations}
      />

      <AlertDialog open={page.deleteDialogOpen} onOpenChange={page.setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A integração será removida e você precisará configurá-la novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={page.handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={page.emailDeleteDialogOpen} onOpenChange={page.setEmailDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover integração de e-mail?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As credenciais SMTP serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={page.handleConfirmEmailDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
