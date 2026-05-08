import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { motion, useInView } from "framer-motion";
import {
  ShoppingCart, Gift, BellRing, BarChart3, Send, RefreshCcw,
  Heart, ArrowRight, Repeat,
} from "lucide-react";
import { AnimatedSection, staggerContainer, staggerItem } from "./AnimationHelpers";

export function LoyaltyEcosystem() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  const steps = [
    { icon: ShoppingCart, title: "Cliente compra", desc: "Pedido sincronizado automaticamente da sua loja" },
    { icon: Gift, title: "Cashback automático", desc: "Cupom gerado e enviado por WhatsApp sem intervenção" },
    { icon: BellRing, title: "Lembrete de expiração", desc: "Aviso antes do cupom vencer para incentivar o uso" },
    { icon: BarChart3, title: "RFM detecta risco", desc: "Matriz identifica quem está parando de comprar" },
    { icon: Send, title: "Campanha WhatsApp", desc: "Disparo segmentado para reativar clientes em risco" },
    { icon: RefreshCcw, title: "Recompra com cupom", desc: "Cliente volta, usa o cashback e o ciclo recomeça" },
  ];

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: "var(--gradient-section)" }} />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">
            <Heart className="h-3.5 w-3.5 mr-1.5" />
            Ecossistema de Fidelização
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Não basta vender uma vez.{" "}
            <span className="text-gradient">Faça o cliente voltar.</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            O SpyPro cria um ciclo automático de fidelização: do pedido ao cashback, do lembrete à recompra — tudo sem planilha e sem esforço manual.
          </p>
        </AnimatedSection>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? "show" : "hidden"}
          className="max-w-5xl mx-auto"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5">
            {steps.map((step, i) => (
              <motion.div key={step.title} variants={staggerItem} className="relative">
                <div className="group rounded-2xl border border-border/30 bg-card/80 backdrop-blur-sm p-5 md:p-6 hover:border-primary/30 hover:shadow-lg transition-all duration-500 h-full">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/[0.08] flex items-center justify-center group-hover:bg-primary group-hover:shadow-glow transition-all duration-500 shrink-0">
                      <step.icon className="h-4.5 w-4.5 text-primary group-hover:text-primary-foreground transition-colors duration-500" />
                    </div>
                    <span className="text-[10px] font-bold text-primary/60 tracking-widest">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="font-semibold text-foreground mb-1.5 text-sm">{step.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
                {i < steps.length - 1 && i !== 2 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ArrowRight className="h-4 w-4 text-primary/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          <AnimatedSection delay={0.4} className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/[0.06] border border-primary/15 px-5 py-2.5 text-sm text-muted-foreground">
              <Repeat className="h-4 w-4 text-primary" />
              <span>Ciclo 100% automático — <strong className="text-foreground">sem intervenção manual</strong></span>
            </div>
          </AnimatedSection>
        </motion.div>
      </div>
    </section>
  );
}
