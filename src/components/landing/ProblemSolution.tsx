import { Badge } from "@/components/ui/badge";
import { AnimatedSection } from "./AnimationHelpers";

export function ProblemSolution() {
  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: "var(--gradient-section)" }} />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="grid md:grid-cols-2 gap-8 lg:gap-16 max-w-5xl mx-auto">
          <AnimatedSection>
            <div className="p-8 rounded-2xl border border-destructive/20 bg-destructive/[0.03]">
              <Badge variant="destructive" className="mb-5 text-xs rounded-full px-4">O problema</Badge>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-tight">
                5 abas abertas pra saber o status de um pedido.
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                O cliente manda mensagem no WhatsApp. Você abre o painel da loja pra ver o pedido,
                entra no Melhor Envio pra rastrear, volta pro WhatsApp pra responder, e ainda esquece
                de mandar o cupom de cashback. <strong className="text-foreground">Ferramentas desconectadas custam vendas.</strong>
              </p>
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <div className="p-8 rounded-2xl border border-primary/20 bg-primary/[0.03]">
              <Badge className="mb-5 text-xs rounded-full px-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">A solução</Badge>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4 leading-tight">
                Um painel. Pedidos, conversas, envios e automações juntos.
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                SpyPro conecta tudo em uma única interface. O cliente manda mensagem e você vê o histórico de pedidos,
                rastreio e perfil RFM — <strong className="text-foreground">sem trocar de aba, sem perder contexto.</strong>
              </p>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
