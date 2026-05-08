import { useNavigate, useParams } from "react-router-dom";
import { CouponsIntegrationSelector } from "@/components/coupons/CouponsIntegrationSelector";
import { CouponsContent } from "@/components/coupons/CouponsContent";

const CouponsPage = () => {
  const { integrationId } = useParams<{ integrationId: string }>();
  const navigate = useNavigate();

  const handleSelectIntegration = (id: string) => {
    navigate(`/coupons/${id}`);
  };

  if (!integrationId) {
    return <CouponsIntegrationSelector onSelectIntegration={handleSelectIntegration} />;
  }

  return <CouponsContent integrationId={integrationId} />;
};

export default CouponsPage;
