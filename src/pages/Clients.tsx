import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ClientsIntegrationSelector } from '@/components/clients/ClientsIntegrationSelector';
import { ClientsContent } from '@/components/clients/ClientsContent';
import { BlingClientsContent } from '@/components/clients/BlingClientsContent';
import { NuvemshopClientsContent } from '@/components/clients/NuvemshopClientsContent';
import { Skeleton } from '@/components/ui/skeleton';

const ClientsPage = () => {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  // Fetch integration type when integrationId is provided
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
    enabled: !!integrationId
  });

  const handleSelectIntegration = (id: string) => {
    navigate(`/clients/${id}`);
  };

  if (!integrationId) {
    return <ClientsIntegrationSelector onSelectIntegration={handleSelectIntegration} />;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (integration?.type === 'bling') return <BlingClientsContent integrationId={integrationId} />;
  if (integration?.type === 'nuvemshop') return <NuvemshopClientsContent integrationId={integrationId} />;
  return <ClientsContent integrationId={integrationId} />;
};

export default ClientsPage;
