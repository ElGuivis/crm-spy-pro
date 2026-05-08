import { useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { SalesIntegrationSelector } from '@/components/sales/SalesIntegrationSelector';
import { SalesContent } from '@/components/sales/SalesContent';
import { BlingSalesContent } from '@/components/sales/BlingSalesContent';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw } from 'lucide-react';

import { createLogger } from '@/lib/logger';
const log = createLogger('Sales');

const SalesPage = () => {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();
  const [integrationType, setIntegrationType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!integrationId) {
      setLoading(false);
      return;
    }

    const fetchIntegrationType = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('integrations')
        .select('type')
        .eq('id', integrationId)
        .single();

      if (error) {
        log.error('Error fetching integration type:', error);
        setIntegrationType(null);
      } else {
        setIntegrationType(data?.type || null);
      }
      setLoading(false);
    };

    fetchIntegrationType();
  }, [integrationId]);

  const handleSelectIntegration = (id: string) => {
    navigate(`/sales/${id}`);
  };

  if (!integrationId) {
    return <SalesIntegrationSelector onSelectIntegration={handleSelectIntegration} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Render appropriate content based on integration type
  if (integrationType === 'bling') {
    return <BlingSalesContent integrationId={integrationId} />;
  }

  // Default to Loja Integrada content
  return <SalesContent integrationId={integrationId} />;
};

export default SalesPage;
