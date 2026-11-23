import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

// App enxuto servido no domínio da loja (ex.: lojaoutback.com.br): só as páginas públicas dela.
//   /          -> grupo VIP da pré-venda
//   /cadastro  -> cadastro (contato no Bling)
// Nada do CRM (login, telas) existe nesse domínio.
const PreVenda = lazy(() => import("@/pages/PreVenda"));
const Cadastro = lazy(() => import("@/pages/Cadastro"));

/** Domínio da loja -> slug das páginas em presale_pages. */
const BRAND_HOSTS: Record<string, string> = {
  "lojaoutback.com.br": "outback",
  "www.lojaoutback.com.br": "outback",
};

export const brandSlug: string | null =
  typeof window === "undefined" ? null : BRAND_HOSTS[window.location.hostname.toLowerCase()] ?? null;

const fallback = <div className="min-h-screen bg-[#080808]" />;

export default function BrandApp({ slug }: { slug: string }) {
  return (
    <BrowserRouter>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/" element={<PreVenda slug={slug} />} />
          <Route path="/cadastro" element={<Cadastro slug={slug} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
