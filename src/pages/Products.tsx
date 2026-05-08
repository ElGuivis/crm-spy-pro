import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ProductsIntegrationSelector } from '@/components/products/ProductsIntegrationSelector';
import { ProductsContent } from '@/components/products/ProductsContent';
import { BlingProductsContent } from '@/components/products/BlingProductsContent';
import { Skeleton } from '@/components/ui/skeleton';

const ProductsPage = () => {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  // Fetch integration type to determine which component to render
  const { data: integration, isLoading } = useQuery({
    queryKey: ['integration-type', integrationId],
    queryFn: async () => {
      if (!integrationId) return null;
      const { data } = await supabase
        .from('integrations')
        .select('id, type')
        .eq('id', integrationId)
        .single();
      return data;
    },
    enabled: !!integrationId
  });

  const handleSelectIntegration = (id: string) => {
    navigate(`/products/${id}`);
  };

  if (!integrationId) {
    return <ProductsIntegrationSelector onSelectIntegration={handleSelectIntegration} />;
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  // Render Bling or Loja Integrada component based on integration type
  if (integration?.type === 'bling') {
    return <BlingProductsContent integrationId={integrationId} />;
  }

  return <ProductsContent integrationId={integrationId} />;
};

export default ProductsPage;
