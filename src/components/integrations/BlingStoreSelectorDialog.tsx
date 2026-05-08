import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, RefreshCw, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { createLogger } from '@/lib/logger';
const log = createLogger('BlingStoreSelectorDialog');

interface BlingStore {
  id: number;
  name: string;
  type: string;
  default?: boolean;
}

interface BlingStoreSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  onConfirm: (storeIds: number[] | null) => void;
  title?: string;
  description?: string;
}

export function BlingStoreSelectorDialog({
  open,
  onOpenChange,
  integrationId,
  onConfirm,
  title = "Selecionar Lojas para Sincronizar",
  description = "Escolha quais lojas/depósitos do Bling você deseja sincronizar. Deixe vazio para sincronizar todas.",
}: BlingStoreSelectorDialogProps) {
  const [stores, setStores] = useState<BlingStore[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncAll, setSyncAll] = useState(false);

  useEffect(() => {
    if (open) {
      fetchStores();
      // Reset state when opening
      setSyncAll(false);
      setSelectedStoreIds([]);
    }
  }, [open, integrationId]);

  const fetchStores = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('bling-stores', {
        body: { integrationId },
      });

      if (error) {
        log.error('Error fetching Bling stores:', error);
        setStores([]);
      } else {
        setStores(data?.stores || []);
      }
    } catch (err) {
      log.error('Error:', err);
      setStores([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleStore = (storeId: number) => {
    setSelectedStoreIds((prev) =>
      prev.includes(storeId)
        ? prev.filter((id) => id !== storeId)
        : [...prev, storeId]
    );
    // If manually selecting stores, disable "sync all"
    setSyncAll(false);
  };

  const handleSyncAllChange = (checked: boolean) => {
    setSyncAll(checked);
    if (checked) {
      setSelectedStoreIds([]);
    }
  };

  const handleConfirm = async () => {
    // If syncAll is true or no stores selected, pass null to sync all
    const storeIds = syncAll || selectedStoreIds.length === 0 ? null : selectedStoreIds;
    
    // Save selected store IDs to integration for future "check for new" syncs
    try {
      await supabase
        .from('integrations')
        .update({ bling_store_ids: storeIds } as any)
        .eq('id', integrationId);
    } catch (err) {
      log.error('Error saving bling_store_ids:', err);
    }
    
    onConfirm(storeIds);
    onOpenChange(false);
  };

  const getStoreIcon = (type: string) => {
    return <Store className="h-4 w-4" />;
  };

  const getStoreTypeBadge = (type: string) => {
    return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{type}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Store List - Show first */}
          <p className="text-sm text-muted-foreground">
            Selecione as lojas que deseja sincronizar:
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {loading ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : stores.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p>Nenhuma loja encontrada no Bling.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchStores}
                  className="mt-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
              </div>
            ) : (
              stores.map((store) => (
                <div
                  key={`${store.type}-${store.id}`}
                  className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    selectedStoreIds.includes(store.id)
                      ? 'bg-primary/5 border-primary'
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleStore(store.id)}
                >
                  <Checkbox
                    id={`store-${store.id}`}
                    checked={selectedStoreIds.includes(store.id)}
                    onCheckedChange={() => toggleStore(store.id)}
                  />
                  <Label
                    htmlFor={`store-${store.id}`}
                    className="flex-1 cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {getStoreIcon(store.type)}
                      <span>{store.name}</span>
                      {store.default && (
                        <span className="text-xs text-green-600">(Padrão)</span>
                      )}
                    </div>
                    {getStoreTypeBadge(store.type)}
                  </Label>
                </div>
              ))
            )}
          </div>

          {/* Sync All Option - At bottom */}
          <div className="flex items-center space-x-3 p-3 bg-muted/50 rounded-lg border">
            <Checkbox
              id="sync-all"
              checked={syncAll}
              onCheckedChange={handleSyncAllChange}
            />
            <Label
              htmlFor="sync-all"
              className="flex-1 cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <span className="font-medium">Sincronizar todas as lojas</span>
            </Label>
          </div>

          {selectedStoreIds.length > 0 && !syncAll && (
            <p className="text-sm text-muted-foreground">
              {selectedStoreIds.length} loja(s) selecionada(s)
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Iniciar Sincronização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
