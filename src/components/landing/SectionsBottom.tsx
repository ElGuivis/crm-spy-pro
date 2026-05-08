import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShoppingCart, MessageSquare, TrendingUp, BarChart3,
  Check, ShieldCheck, ArrowRight, Star,
} from "lucide-react";
import React from "react";
import { AnimatedSection } from "./AnimationHelpers";

export function Scenarios() {
  const scenarios = [
    { icon: ShoppingCart, title: "Vende na Loja Integrada ou Bling", benefits: ["Pedidos sincronizados automaticamente", "Clientes e produtos sempre atualizados", "Status de pagamento em tempo real"] },
    { icon: MessageSquare, title: "Atende por WhatsApp", benefits: ["Inbox unificada com histórico completo", "Chatbot + agente IA respondendo 24h", "Templates prontos e macros rápidas"] },
    { icon: TrendingUp, title: "Precisa recuperar vendas", benefits: ["Disparos em massa com variáveis dinâmicas", "Cashback pós-compra com cupom gerado", "Campanhas de reativação por WhatsApp"] },
    { icon: BarChart3, title: "Quer entender seus clientes", benefits: ["Matriz RFM com segmentação automática", "Previsões de churn e audiências", "Coortes e evolução de segmentos"] },
  ];

  return (
    <section className="py-24 lg:py-32 relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">Para quem é</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">Se encaixa na sua operação?</h2>
          <p className="text-muted-foreground text-lg">SpyPro foi feito para quem vende online no Brasil e quer parar de perder tempo.</p>
        </AnimatedSection>

        <div className="grid sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {scenarios.map((s, i) => (
            <AnimatedSection key={s.title} delay={i * 0.1}>
              <Card className="border-border/30 bg-card/80 backdrop-blur-sm hover:border-primary/20 transition-all duration-500 h-full">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-11 w-11 rounded-2xl bg-primary/[0.08] flex items-center justify-center">
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground">{s.title}</h3>
                  </div>
                  <ul className="space-y-3">
                    {s.benefits.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                          <Check className="h-3 w-3 text-primary" />
                        </div>
                        {b}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MidCTA() {
  return (
    <section className="py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="max-w-4xl mx-auto text-center rounded-3xl p-10 lg:p-16 relative overflow-hidden border border-primary/10">
            <div className="absolute inset-0 gradient-whatsapp opacity-[0.04]" />
            <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-primary/10 blur-[100px]" />
            <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full bg-primary/10 blur-[100px]" />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground mb-4">
                Menos abas abertas.{" "}
                <span className="text-gradient">Mais pedidos fechados.</span>
              </h2>
              <p className="text-muted-foreground mb-8 max-w-lg mx-auto text-lg">
                Comece a operar com tudo centralizado. Conecte suas plataformas em minutos.
              </p>
              <Button asChild size="xl" className="gradient-whatsapp shadow-glow font-semibold rounded-full px-10">
                <Link to="/auth">Criar minha conta grátis <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}

export function ObjectionBreaker() {
  const objections = [
    { q: "Preciso instalar algo?", a: "Não. SpyPro funciona 100% no navegador. Abra, conecte e use." },
    { q: "Funciona com minha loja?", a: "Integra com Loja Integrada, Bling, Melhor Envio, WhatsApp (Evolution + Meta), Instagram e e-mail." },
    { q: "É difícil de configurar?", a: "Conexão via OAuth em poucos cliques. O sistema sincroniza tudo automaticamente." },
    { q: "É só um painel de métricas?", a: "Não. Você opera de verdade: atende clientes, dispara campanhas, configura automações e gerencia equipe." },
    { q: "Minha equipe pode usar junto?", a: "Sim. Controle de papéis com permissões por módulo." },
  ];

  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <AnimatedSection className="text-center mb-12">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">Dúvidas comuns</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Antes que você pergunte</h2>
        </AnimatedSection>

        <div className="space-y-3">
          {objections.map((o, i) => (
            <AnimatedSection key={o.q} delay={i * 0.08}>
              <div className="rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm p-6 hover:border-primary/20 transition-colors">
                <p className="font-semibold text-foreground mb-2 flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  </div>
                  {o.q}
                </p>
                <p className="text-sm text-muted-foreground pl-[38px]">{o.a}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FAQSection() {
  const faqs = [
    { q: "O que é o SpyPro?", a: "Um CRM operacional para e-commerces brasileiros. Centraliza atendimento via WhatsApp, gestão de pedidos, envios, automações de marketing, disparos em massa, análise RFM e gestão de equipe — tudo em um único painel." },
    { q: "Quais plataformas integram?", a: "Loja Integrada, Bling (com OAuth e multi-loja), WhatsApp via Evolution API e Meta Cloud API, Melhor Envio, Instagram e e-mail. Todas com sincronização automática." },
    { q: "Como funciona o agente IA?", a: "Configure um agente generativo com prompt personalizado, conecte a dados do seu negócio e ele responde clientes no WhatsApp com contexto real. Também é possível criar chatbots estruturados com fluxo de decisão." },
    { q: "Preciso ter conhecimento técnico?", a: "Não. As integrações são feitas com OAuth (poucos cliques). Automações e chatbots são configurados por interface visual." },
    { q: "Como funcionam os tokens?", a: "Cada ação automatizada (mensagem IA, disparo, automação) consome tokens. Você acompanha o saldo e o consumo no painel de tokens." },
    { q: "Posso usar com mais de uma loja?", a: "Sim. O sistema é multi-tenant. Conecte múltiplas integrações Bling e gerencie tudo no mesmo painel." },
  ];

  return (
    <section id="faq" className="py-24 lg:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
        <AnimatedSection className="text-center mb-12">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">FAQ</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Perguntas frequentes</h2>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm px-6 data-[state=open]:border-primary/20 transition-colors">
                <AccordionTrigger className="text-left font-semibold text-foreground hover:no-underline py-5">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed pb-5">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </AnimatedSection>
      </div>
    </section>
  );
}

export const FinalCTA = React.forwardRef<HTMLElement>((_props, _ref) => {
  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-2xl relative z-10">
        <AnimatedSection>
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl gradient-whatsapp mb-8" style={{ boxShadow: "var(--shadow-glow-lg)" }}>
            <Star className="h-7 w-7 text-primary-foreground" />
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground mb-5 leading-tight">
            Pare de alternar entre abas.{" "}
            <span className="text-gradient">Centralize agora.</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto">
            Pedidos, conversas, envios, automações e clientes — um painel, uma operação.
          </p>
          <Button asChild size="xl" className="gradient-whatsapp shadow-glow font-semibold text-base rounded-full px-12">
            <Link to="/auth">Criar minha conta grátis <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
          <p className="mt-6 text-sm text-muted-foreground">
            Sem cartão de crédito · Setup em 5 minutos
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
});
FinalCTA.displayName = "FinalCTA";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/30 py-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <SpyProLogo size="sm" showText />
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
            <Link to="/auth" className="hover:text-foreground transition-colors">Login</Link>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} SpyPro. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}

// Need imports for Footer
import { SpyProLogo } from "@/components/common/SpyProLogo";
