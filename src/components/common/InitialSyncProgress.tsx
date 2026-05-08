import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

interface InitialSyncProgressProps {
  integrationId: string;
  onSyncComplete?: () => void;
}

export function InitialSyncProgress({ integrationId, onSyncComplete }: InitialSyncProgressProps) {
  const [initialSyncCompleted, setInitialSyncCompleted] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkInitialSync();
  }, [integrationId]);

  const checkInitialSync = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('integrations')
      .select('initial_sync_completed')
      .eq('id', integrationId)
      .single();
    
    setInitialSyncCompleted(data?.initial_sync_completed ?? false);
    setIsLoading(false);
  };

  const handleRetrySync = async () => {
    await supabase.functions.invoke('li-sync', {
      body: { integrationId, syncType: 'all' }
    });
    setTimeout(checkInitialSync, 2000);
  };

  if (isLoading || initialSyncCompleted) return null;

  return (
    <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-300">Sincronização inicial pendente</p>
              <p className="text-sm text-muted-foreground">Os dados ainda não foram importados da Loja Integrada</p>
            </div>
          </div>
          <Button onClick={handleRetrySync} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Iniciar Sincronização
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
