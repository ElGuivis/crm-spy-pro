import { Badge } from "@/components/ui/badge";
import { Plug, Activity, Zap } from "lucide-react";
import { AnimatedSection } from "./AnimationHelpers";

export function HowItWorks() {
  const steps = [
    { num: "01", icon: Plug, title: "Conecte suas plataformas", desc: "Loja Integrada, Bling, WhatsApp, Melhor Envio e Meta. OAuth em poucos cliques." },
    { num: "02", icon: Activity, title: "Opere tudo em um painel", desc: "Atenda clientes, veja pedidos, rastreie envios e configure automações. Tudo centralizado." },
    { num: "03", icon: Zap, title: "Deixe o sistema trabalhar", desc: "Chatbot com IA, cashback automático, notificações e campanhas agendadas rodam sozinhos." },
  ];

  return (
    <section id="como-funciona" className="py-24 lg:py-32 relative">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">
            Como funciona
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            3 passos para centralizar sua operação
          </h2>
        </AnimatedSection>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((s, i) => (
            <AnimatedSection key={s.num} delay={i * 0.15} className="relative text-center">
              {i < 2 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] border-t-2 border-dashed border-primary/15" />
              )}
              <div className="relative z-10 mx-auto h-24 w-24 rounded-3xl gradient-whatsapp flex items-center justify-center mb-6" style={{ boxShadow: "var(--shadow-glow-lg)" }}>
                <s.icon className="h-9 w-9 text-primary-foreground" />
              </div>
              <span className="text-xs font-bold text-primary mb-2 block tracking-widest">PASSO {s.num}</span>
              <h3 className="text-lg font-bold text-foreground mb-3">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}
