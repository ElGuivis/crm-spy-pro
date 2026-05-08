import { useNavigate, useParams } from 'react-router-dom';
import { EnviosIntegrationSelector } from '@/components/envios/EnviosIntegrationSelector';
import { EnviosContent } from '@/components/envios/EnviosContent';

export default function Envios() {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  const handleSelectIntegration = (id: string) => {
    navigate(`/envios/${id}`);
  };

  if (!integrationId) {
    return <EnviosIntegrationSelector onSelectIntegration={handleSelectIntegration} />;
  }

  return <EnviosContent integrationId={integrationId} />;
}
