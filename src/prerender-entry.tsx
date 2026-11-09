// Usado só no build (scripts/prerender.mjs): gera o HTML estático de "/", "/privacidade" e "/termos"
// para que quem não executa JavaScript (rastreadores, verificação do Google) veja o texto.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";
import { AdsManagerSection } from "@/components/landing/AdsManagerSection";
import { SpyProLogo } from "@/components/common/SpyProLogo";
import { Link } from "react-router-dom";

function LandingStatic() {
  return (
    <div className="min-h-screen bg-background text-foreground dark">
      <header className="container mx-auto px-4 py-6">
        <SpyProLogo size="md" showText />
      </header>
      <main>
        <section className="container mx-auto px-4 py-16 max-w-3xl text-center">
          <h1 className="text-4xl font-extrabold mb-6">SpyPro — CRM inteligente para e-commerce</h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Pedidos, WhatsApp e envios em uma tela. Centralize sua operação e fidelize seus clientes com cashback
            automático, Matriz RFM e campanhas inteligentes, tudo integrado ao seu e-commerce brasileiro.
          </p>
        </section>
        <AdsManagerSection />
      </main>
      <footer className="border-t border-border/30 py-10 text-center text-sm text-muted-foreground">
        <p className="flex items-center justify-center gap-6">
          <Link to="/privacidade" className="underline">Política de privacidade</Link>
          <Link to="/termos" className="underline">Termos de uso</Link>
          <Link to="/auth" className="underline">Login</Link>
        </p>
        <p className="mt-4 text-xs">© {new Date().getFullYear()} SpyPro. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}

const pages: Record<string, () => JSX.Element> = {
  "/": LandingStatic,
  "/privacidade": PrivacyPolicy,
  "/termos": TermsOfService,
};

export function renderRoute(path: string): string {
  const Page = pages[path];
  return renderToString(
    <StaticRouter location={path}>
      <Page />
    </StaticRouter>,
  );
}

export const routes = Object.keys(pages);
