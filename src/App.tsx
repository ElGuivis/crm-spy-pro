import { Toaster } from "@/components/ui/sonner";
import { Toaster as RadixToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { TokenProvider } from "@/contexts/TokenContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { NewOrdersProvider } from "@/contexts/NewOrdersContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

import { Suspense, lazy } from "react";
import { SkeletonStats } from "@/components/common/SkeletonLoaders";

// Eager-loaded (critical path)
import Auth from "./pages/Auth";
import LandingPage from "./pages/LandingPage";
import NotFound from "./pages/NotFound";
import BlingCallback from "./pages/BlingCallback";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import AcceptInvite from "./pages/AcceptInvite";

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const Atendimentos = lazy(() => import("./pages/Atendimentos"));
const Sales = lazy(() => import("./pages/Sales"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Automations = lazy(() => import("./pages/Automations"));
const Coupons = lazy(() => import("./pages/Coupons"));
const Clients = lazy(() => import("./pages/Clients"));
const Products = lazy(() => import("./pages/Products"));
const RFM = lazy(() => import("./pages/RFM"));
const Team = lazy(() => import("./pages/Team"));
const Tokens = lazy(() => import("./pages/Tokens"));
const Envios = lazy(() => import("./pages/Envios"));
const BulkCampaigns = lazy(() => import("./pages/BulkCampaigns"));
const Settings = lazy(() => import("./pages/Settings"));
const CatalogoWhatsApp = lazy(() => import("./pages/CatalogoWhatsApp"));
const EmailMarketing = lazy(() => import("./pages/EmailMarketing"));
const InstagramComunicacao = lazy(() => import("./pages/InstagramComunicacao"));
const Operations = lazy(() => import("./pages/Operations"));

function PageLoader() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="h-8 w-48 rounded-lg bg-muted shimmer" />
      <SkeletonStats count={4} />
      <div className="h-64 rounded-xl border border-border bg-card shimmer" />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TokenProvider>
        <NewOrdersProvider>
          <TooltipProvider>
            <Toaster />
            <RadixToaster />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/privacidade" element={<PrivacyPolicy />} />
                <Route path="/termos" element={<TermsOfService />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/bling/callback" element={<BlingCallback />} />
                <Route path="/invite" element={<AcceptInvite />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <MainLayout>
                        <Suspense fallback={<PageLoader />}>
                          <Routes>
                            <Route path="/dashboard" element={<Index />} />
                            <Route path="/atendimentos" element={<Atendimentos />} />
                            <Route path="/sales" element={<Sales />} />
                            <Route path="/sales/:integrationId" element={<Sales />} />
                            <Route path="/integrations" element={<Integrations />} />
                            <Route path="/automations" element={<Automations />} />
                            <Route path="/coupons" element={<Coupons />} />
                            <Route path="/coupons/:integrationId" element={<Coupons />} />
                            <Route path="/clients" element={<Clients />} />
                            <Route path="/clients/:integrationId" element={<Clients />} />
                            <Route path="/products" element={<Products />} />
                            <Route path="/products/:integrationId" element={<Products />} />
                            <Route path="/rfm" element={<RFM />} />
                            <Route path="/rfm/:integrationId" element={<RFM />} />
                            <Route path="/team" element={<Team />} />
                            <Route path="/tokens" element={<Tokens />} />
                            <Route path="/envios" element={<Envios />} />
                            <Route path="/envios/:integrationId" element={<Envios />} />
                            <Route path="/disparos" element={<BulkCampaigns />} />
                            <Route path="/email-marketing" element={<EmailMarketing />} />
                            <Route path="/instagram" element={<InstagramComunicacao />} />
                            <Route path="/catalogo-whatsapp" element={<CatalogoWhatsApp />} />
                            <Route path="/catalogo-whatsapp/:integrationId" element={<CatalogoWhatsApp />} />
                            <Route path="/operations" element={<Operations />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </Suspense>
                      </MainLayout>
                    </ProtectedRoute>
                  }
                />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </NewOrdersProvider>
      </TokenProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
