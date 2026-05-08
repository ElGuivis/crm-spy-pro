import { useState } from "react";
import { useParams } from "react-router-dom";
import { CatalogoIntegrationSelector } from "@/components/catalogo/CatalogoIntegrationSelector";
import { CatalogoContent } from "@/components/catalogo/CatalogoContent";

export default function CatalogoWhatsApp() {
  const { integrationId } = useParams();
  const [selectedId, setSelectedId] = useState<string | null>(integrationId || null);

  if (!selectedId) {
    return <CatalogoIntegrationSelector onSelectIntegration={setSelectedId} />;
  }

  return <CatalogoContent integrationId={selectedId} />;
}
