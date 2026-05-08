import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RFMIntegrationSelector } from '@/components/rfm/RFMIntegrationSelector';
import { RFMDashboard } from '@/components/rfm/RFMDashboard';
import { Skeleton } from '@/components/ui/skeleton';

const RFMPage = () => {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  const { data: integration, isLoading } = useQuery({
    queryKey: ['integration-type', integrationId],
    queryFn: async () => {
      if (!integrationId) return null;
      const { data, error } = await supabase
        .from('integrations')
        .select('id, type, name')
        .eq('id', integrationId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!integrationId,
  });

  const handleSelectIntegration = (id: string) => {
    navigate(`/rfm/${id}`);
  };

  if (!integrationId) {
    return <RFMIntegrationSelector onSelectIntegration={handleSelectIntegration} />;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const sourceType = integration?.type === 'bling' ? 'bling' : 'loja_integrada';

  return <RFMDashboard integrationId={integrationId} sourceType={sourceType} integrationName={integration?.name || ''} />;
};

export default RFMPage;
