import { useState } from "react";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { createLogger } from '@/lib/logger';
const log = createLogger('DeleteIntegrationDataButton');

interface TableToDelete {
  table: string;
  itemsTable?: string;
  itemsForeignKey?: string;
}

interface DeleteIntegrationDataButtonProps {
  integrationId: string;
  dataType: string;
  tablesToDelete: TableToDelete[];
  onDeleted?: () => void;
  variant?: "default" | "outline" | "ghost" | "destructive";
}

export function DeleteIntegrationDataButton({
  integrationId,
  dataType,
  tablesToDelete,
  onDeleted,
  variant = "outline",
}: DeleteIntegrationDataButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    
    try {
      for (const tableInfo of tablesToDelete) {
        // If there's an items table, delete items first
        if (tableInfo.itemsTable && tableInfo.itemsForeignKey) {
          // Get all parent IDs first using raw query approach
          const { data: parentRecords, error: selectError } = await supabase
            .from(tableInfo.table as any)
            .select('id')
            .eq('integration_id', integrationId);
          
          if (selectError) {
            log.error(`Error fetching from ${tableInfo.table}:`, selectError);
          }
          
          if (parentRecords && parentRecords.length > 0) {
            const parentIds = parentRecords.map((r: any) => r.id);
            
            // Delete items in batches
            for (let i = 0; i < parentIds.length; i += 100) {
              const batch = parentIds.slice(i, i + 100);
              const { error: itemsError } = await supabase
                .from(tableInfo.itemsTable as any)
                .delete()
                .in(tableInfo.itemsForeignKey, batch);
              
              if (itemsError) {
                log.error(`Error deleting from ${tableInfo.itemsTable}:`, itemsError);
              }
            }
          }
        }
        
        // Delete main table records in batches — loop until all gone (Supabase caps SELECT at 1000)
        while (true) {
          const { data: mainRecords, error: mainSelectError } = await supabase
            .from(tableInfo.table as any)
            .select('id')
            .eq('integration_id', integrationId)
            .limit(500);

          if (mainSelectError) {
            log.error(`Error fetching ids from ${tableInfo.table}:`, mainSelectError);
            throw mainSelectError;
          }

          if (!mainRecords || mainRecords.length === 0) break;

          const mainIds = mainRecords.map((r: any) => r.id);
          const { error } = await supabase
            .from(tableInfo.table as any)
            .delete()
            .in('id', mainIds);
          if (error) {
            log.error(`Error deleting from ${tableInfo.table}:`, error);
            throw error;
          }
        }
      }

      toast({
        title: "Dados excluídos",
        description: `Todos os ${dataType} desta integração foram removidos.`,
      });

      setOpen(false);
      onDeleted?.();
    } catch (error: any) {
      log.error('Error deleting data:', error);
      toast({
        title: "Erro ao excluir",
        description: error.message || "Não foi possível excluir os dados.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Excluir Dados
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Excluir {dataType}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação irá excluir permanentemente todos os <strong>{dataType}</strong> sincronizados 
            desta integração. Os dados poderão ser sincronizados novamente posteriormente.
            <br /><br />
            <span className="text-destructive font-medium">Esta ação não pode ser desfeita.</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Excluindo...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
