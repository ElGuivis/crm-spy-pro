import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Store, Link2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

import { createLogger } from '@/lib/logger';
const log = createLogger('StoreLinker');

interface StoreLinkerProps {
  integrationId: string;
  onLinked?: () => void;
}

interface StoreIntegration {
  id: string;
  name: string;
  type: string;
}

export function StoreLinker({ integrationId, onLinked }: StoreLinkerProps) {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreIntegration[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [currentStore, setCurrentStore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [linkStats, setLinkStats] = useState<{ linked: number; total: number } | null>(null);

  // Fetch available store integrations and current link
  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch ecommerce integrations
        const { data: storeData } = await supabase
          .from('integrations')
          .select('id, name, type')
          .eq('tenant_id', tenantId)
          .in('type', ['loja_integrada', 'bling'])
          .in('status', ['active', 'connected']);

        setStores(storeData || []);

        // Fetch current store link
        const { data: meIntegration } = await supabase
          .from('integrations')
          .select('store_integration_id')
          .eq('id', integrationId)
          .single();

        const storeId = (meIntegration as any)?.store_integration_id || null;
        setCurrentStore(storeId);
        setSelectedStore(storeId);
      } catch (err) {
        log.error('Error fetching store data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [tenantId, integrationId]);

  // Fetch link stats
  useEffect(() => {
    const fetchLinkStats = async () => {
      const [totalResult, linkedLiResult, linkedBlingResult] = await Promise.all([
        supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId),
        supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).not('li_order_id', 'is', null),
        supabase.from('me_shipments').select('id', { count: 'exact', head: true }).eq('integration_id', integrationId).not('bling_order_id', 'is', null),
      ]);

      const linked = (linkedLiResult.count || 0) + (linkedBlingResult.count || 0);
      setLinkStats({ linked, total: totalResult.count || 0 });
    };

    fetchLinkStats();
  }, [integrationId]);

  const handleSaveStore = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ store_integration_id: selectedStore } as any)
        .eq('id', integrationId);

      if (error) throw error;

      setCurrentStore(selectedStore);
      toast({
        title: 'Loja vinculada',
        description: 'A loja foi associada a esta conta de envio.',
      });
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao vincular loja',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoLink = async () => {
    if (!currentStore) {
      toast({
        title: 'Selecione uma loja',
        description: 'Vincule uma loja antes de associar pedidos.',
        variant: 'destructive',
      });
      return;
    }

    setIsLinking(true);
    try {
      const store = stores.find(s => s.id === currentStore);
      if (!store) throw new Error('Loja não encontrada');

      const { data, error } = await supabase.rpc('link_me_shipments_to_orders', {
        p_me_integration_id: integrationId,
        p_store_integration_id: currentStore,
        p_store_type: store.type,
      });

      if (error) throw error;

      const result = data as any;
      toast({
        title: 'Vinculação concluída',
        description: `${result.linked_now} envio(s) vinculado(s). Total: ${result.already_linked + result.linked_now}/${result.total}`,
      });

      setLinkStats({
        linked: result.already_linked + result.linked_now,
        total: result.total,
      });

      onLinked?.();
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message || 'Falha ao vincular pedidos',
        variant: 'destructive',
      });
    } finally {
      setIsLinking(false);
    }
  };

  if (isLoading) return null;

  const currentStoreName = stores.find(s => s.id === currentStore)?.name;
  const hasChanged = selectedStore !== currentStore;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <Select value={selectedStore || 'none'} onValueChange={(v) => setSelectedStore(v === 'none' ? null : v)}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Vincular loja..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma loja</SelectItem>
            {stores.map(store => (
              <SelectItem key={store.id} value={store.id}>
                {store.name} ({store.type === 'loja_integrada' ? 'LI' : 'Bling'})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasChanged && (
          <Button size="sm" onClick={handleSaveStore} disabled={isSaving}>
            {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Salvar'}
          </Button>
        )}
      </div>

      {currentStore && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoLink}
          disabled={isLinking}
          className="gap-1"
        >
          <Link2 className={`h-3.5 w-3.5 ${isLinking ? 'animate-spin' : ''}`} />
          {isLinking ? 'Vinculando...' : 'Vincular Pedidos'}
        </Button>
      )}

      {linkStats && linkStats.total > 0 && (
        <Badge variant="secondary" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {linkStats.linked}/{linkStats.total} vinculados
        </Badge>
      )}
    </div>
  );
}
