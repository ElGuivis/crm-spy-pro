import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, useInView } from "framer-motion";
import {
  MessageSquare, ShoppingCart, Zap, Truck, BarChart3, Send, Gift, Users,
} from "lucide-react";
import { AnimatedSection, staggerContainer, staggerItem } from "./AnimationHelpers";

const features = [
  { icon: MessageSquare, title: "Hub de Atendimento", desc: "WhatsApp e Instagram com IA treinada no seu negócio. Chatbot + agente generativo no mesmo lugar." },
  { icon: ShoppingCart, title: "Vendas e Pedidos", desc: "Pedidos em tempo real com sync automática da Loja Integrada e Bling. Sem importação manual." },
  { icon: Zap, title: "Automações", desc: "Cashback automático, notificações de pedido, aniversário com cupom e campanhas em massa." },
  { icon: Truck, title: "Envios e Rastreio", desc: "Em trânsito, entregues e atrasados em painel integrado ao Melhor Envio." },
  { icon: BarChart3, title: "Matriz RFM", desc: "Descubra quais clientes vão parar de comprar. Heatmap, coortes e audiências automáticas." },
  { icon: Send, title: "Disparos em Massa", desc: "Campanhas por WhatsApp com CSV, variáveis dinâmicas, agendamento e controle de horário." },
  { icon: Gift, title: "Cupons e Cashback", desc: "Cupons automáticos vinculados a automações. Fidelize clientes sem planilha." },
  { icon: Users, title: "Gestão de Equipe", desc: "Papéis de proprietário, admin e membro. Cada pessoa vê só o que precisa." },
];

export function FeaturesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="funcionalidades" className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-muted/20" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">
            Funcionalidades
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Tudo que seu e-commerce precisa.{" "}
            <span className="text-gradient">Em um lugar só.</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Cada módulo resolve uma dor real de quem vende online no Brasil.
          </p>
        </AnimatedSection>

        <motion.div ref={ref} variants={staggerContainer} initial="hidden" animate={isInView ? "show" : "hidden"}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {features.map((f) => (
            <motion.div key={f.title} variants={staggerItem}>
              <Card className="group h-full border-border/30 bg-card/80 backdrop-blur-sm hover:border-primary/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-500">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-2xl bg-primary/[0.08] flex items-center justify-center mb-5 group-hover:bg-primary group-hover:shadow-glow transition-all duration-500">
                    <f.icon className="h-5 w-5 text-primary group-hover:text-primary-foreground transition-colors duration-500" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2 text-[15px]">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
