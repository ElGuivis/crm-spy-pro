import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { BrandHost } from "./brandHosts";

// App enxuto servido nos subdomínios de uma loja: só a página pública daquele subdomínio,
// na raiz ("/"); qualquer outro caminho volta para "/". Nada do CRM existe nesses endereços.
//   grupovip.lojaoutback.com.br -> grupo VIP da pré-venda
//   cadastro.lojaoutback.com.br -> cadastro (contato no Bling)
const PreVenda = lazy(() => import("@/pages/PreVenda"));
const Cadastro = lazy(() => import("@/pages/Cadastro"));

export default function BrandApp({ site }: { site: BrandHost }) {
  const page = site.page === "cadastro" ? <Cadastro slug={site.slug} /> : <PreVenda slug={site.slug} />;
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-[#080808]" />}>
        <Routes>
          <Route path="/" element={page} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
