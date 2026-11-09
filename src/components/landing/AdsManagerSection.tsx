import { Link } from "react-router-dom";

/** Seção "SpyPro Ads Manager" da página inicial (também usada no HTML pré-renderizado). */
export function AdsManagerSection() {
  return (
    <section id="ads-manager" className="py-16 border-t border-border/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl text-center">
        <h2 className="text-3xl font-bold text-foreground mb-4">SpyPro Ads Manager</h2>
        <p className="text-muted-foreground text-lg leading-relaxed">
          Ferramenta de gestão e otimização de campanhas do Google Ads. Conecte sua conta do Google Ads
          para acompanhar o desempenho, receber recomendações e aplicar otimizações com aprovação.
          Uso interno da equipe SpyPro.
        </p>
        <p className="mt-6 text-sm flex items-center justify-center gap-6">
          <Link to="/privacidade" className="text-primary underline underline-offset-4">Política de privacidade</Link>
          <Link to="/termos" className="text-primary underline underline-offset-4">Termos de uso</Link>
        </p>
      </div>
    </section>
  );
}
