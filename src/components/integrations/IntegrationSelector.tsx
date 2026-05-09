import { ReactNode, useState } from 'react';
import { Plus, Wifi, WifiOff, ArrowRight, Package, Users, ShoppingBag, Truck, Clock, Trash2, MoreVertical, Ticket } from 'lucide-react';
import { getIntegrationBrand } from '@/lib/integration-logos';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IntegrationData, IntegrationCategory } from '@/hooks/useIntegrationData';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { createLogger } from '@/lib/logger';
const log = createLogger('IntegrationSelector');

interface IntegrationSelectorProps {
  category: IntegrationCategory;
  title: string;
  description: string;
  emptyStateMessage: string;
  emptyStateIcon: ReactNode;
  integrations: IntegrationData[];
  isLoading: boolean;
  onSelectIntegration: (integrationId: string) => void;
  onAddIntegration: () => void;
  addButtonText: string;
  addButtonDescription: string;
  onIntegrationDeleted?: () => void;
}

export function IntegrationSelector({
  category,
  title,
  description,
  emptyStateMessage,
  emptyStateIcon,
  integrations,
  isLoading,
  onSelectIntegration,
  onAddIntegration,
  addButtonText,
  addButtonDescription,
  onIntegrationDeleted,
}: IntegrationSelectorProps) {

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-6">
                <Skeleton className="h-12 w-12 rounded-full mb-4" />
                <Skeleton className="h-5 w-32 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-2">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Existing Integrations */}
        {integrations.map((integration) => (
          <IntegrationCard 
            key={integration.id} 
            integration={integration}
            category={category}
            onClick={() => onSelectIntegration(integration.id)}
            onDeleted={onIntegrationDeleted}
          />
        ))}

        {/* Add New Integration Card */}
        <Card 
          className="border-dashed border-2 border-muted-foreground/30 hover:border-primary/50 hover:bg-accent/50 transition-all cursor-pointer group"
          onClick={onAddIntegration}
        >
          <CardContent className="p-6 flex flex-col items-center justify-center min-h-[180px] text-center">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">{addButtonText}</h3>
            <p className="text-sm text-muted-foreground">{addButtonDescription}</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {integrations.length === 0 && (
        <div className="text-center py-12">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            {emptyStateIcon}
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Nenhuma integração</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {emptyStateMessage}
          </p>
          <Button onClick={onAddIntegration}>
            <Plus className="h-4 w-4 mr-2" />
            {addButtonText}
          </Button>
        </div>
      )}
    </div>
  );
}

interface IntegrationCardProps {
  integration: IntegrationData;
  category: IntegrationCategory;
  onClick: () => void;
  onDeleted?: () => void;
}

function IntegrationCard({ integration, category, onClick, onDeleted }: IntegrationCardProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isConnected = integration.status === 'connected';

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      // Delete related data based on category
      if (category === 'ecommerce') {
        // Delete order items first (foreign key constraint)
        const { data: orders } = await supabase
          .from('li_orders')
          .select('id')
          .eq('integration_id', integration.id);
        
        if (orders && orders.length > 0) {
          const orderIds = orders.map(o => o.id);
          await supabase
            .from('li_order_items')
            .delete()
            .in('order_id', orderIds);
        }

        // Delete orders, customers, products
        await Promise.all([
          supabase.from('li_orders').delete().eq('integration_id', integration.id),
          supabase.from('li_customers').delete().eq('integration_id', integration.id),
          supabase.from('li_products').delete().eq('integration_id', integration.id),
        ]);

        // Delete sync jobs and logs
        await supabase.from('li_webhook_events').delete().eq('integration_id', integration.id);
        await supabase.from('li_sync_state').delete().eq('integration_id', integration.id);
      }

      // Delete the integration itself
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', integration.id);

      if (error) throw error;

      toast.success(`Integração "${integration.name}" removida com sucesso!`);
      onDeleted?.();
    } catch (error) {
      log.error('Error deleting integration:', error);
      toast.error('Erro ao remover integração. Tente novamente.');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const brand = getIntegrationBrand(integration.type);

  const getIcon = () => {
    if (brand.logo) {
      return (
        <img 
          src={brand.logo} 
          alt={integration.name} 
          className="h-7 w-7 object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      );
    }
    switch (category) {
      case 'ecommerce':
        return <ShoppingBag className="h-6 w-6 text-primary" />;
      case 'shipping':
        return <Truck className="h-6 w-6 text-orange-500" />;
      default:
        return <Package className="h-6 w-6 text-primary" />;
    }
  };

  const getIconBgColor = () => {
    return brand.color || 'bg-primary/10';
  };

  const renderStats = () => {
    const stats = integration.stats;
    const items: { label: string; value: number; icon: ReactNode }[] = [];

    if (category === 'ecommerce') {
      if (stats.orders !== undefined) {
        items.push({ label: 'pedidos', value: stats.orders, icon: <ShoppingBag className="h-3 w-3" /> });
      }
      if (stats.customers !== undefined) {
        items.push({ label: 'clientes', value: stats.customers, icon: <Users className="h-3 w-3" /> });
      }
      if (stats.products !== undefined) {
        items.push({ label: 'produtos', value: stats.products, icon: <Package className="h-3 w-3" /> });
      }
      if (stats.coupons !== undefined && stats.coupons > 0) {
        items.push({ label: 'cupons', value: stats.coupons, icon: <Ticket className="h-3 w-3" /> });
      }
    } else if (category === 'shipping') {
      if (stats.shipments !== undefined) {
        items.push({ label: 'envios', value: stats.shipments, icon: <Truck className="h-3 w-3" /> });
      }
    }

    if (items.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mt-3">
        {items.slice(0, 3).map((item, idx) => (
          <Badge key={idx} variant="secondary" className="text-xs font-normal">
            {item.icon}
            <span className="ml-1">{item.value.toLocaleString()} {item.label}</span>
          </Badge>
        ))}
      </div>
    );
  };

  return (
    <>
      <Card 
        className="border-border hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group relative"
        onClick={onClick}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className={`h-12 w-12 rounded-full ${getIconBgColor()} flex items-center justify-center`}>
              {getIcon()}
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir integração
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          <h3 className="font-semibold text-foreground mb-1 truncate">{integration.name}</h3>
          
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
            <span className="capitalize">{integration.type.replace(/_/g, ' ')}</span>
          </div>

          {renderStats()}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-green-600">Conectado</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-xs text-destructive">Desconectado</span>
                </>
              )}
            </div>
            {integration.lastSyncAt && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(integration.lastSyncAt), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir integração?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover permanentemente a integração <strong>"{integration.name}"</strong> e todos os dados associados (pedidos, clientes, produtos, logs de sincronização).
              <br /><br />
              <span className="text-destructive font-medium">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
