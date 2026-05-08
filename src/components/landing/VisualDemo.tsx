import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion, useInView } from "framer-motion";
import {
  Zap, Truck, Send, Gift, Heart, Package, BarChart3,
  MessageSquare, Users, Clock,
} from "lucide-react";
import { AnimatedSection, staggerContainer, staggerItem } from "./AnimationHelpers";

export function VisualDemo() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-muted/20" />
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">
            Por dentro do sistema
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Veja o que você controla <span className="text-gradient">de verdade</span>
          </h2>
        </AnimatedSection>

        <motion.div ref={ref} variants={staggerContainer} initial="hidden" animate={isInView ? "show" : "hidden"}
          className="grid md:grid-cols-2 gap-5 max-w-5xl mx-auto">
          {/* Automations */}
          <motion.div variants={staggerItem}>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm h-full">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5 font-medium">
                  <Zap className="h-3.5 w-3.5 text-primary" /> Automações ativas
                </p>
                <div className="space-y-2.5">
                  {[
                    { name: "Disparo em massa", icon: Send },
                    { name: "Cashback pós-compra", icon: Gift },
                    { name: "Notificação de envio", icon: Truck },
                    { name: "Aniversário + cupom", icon: Heart },
                  ].map((a) => (
                    <div key={a.name} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/20">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/[0.08] flex items-center justify-center">
                          <a.icon className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <span className="text-sm font-medium text-foreground">{a.name}</span>
                      </div>
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* RFM */}
          <motion.div variants={staggerItem}>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm h-full">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5 font-medium">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" /> Matriz RFM
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: 25 }).map((_, i) => {
                    const opacities = [15, 25, 35, 50, 70, 85, 40, 20, 60, 90, 30, 45, 75, 55, 65, 10, 80, 95, 22, 48, 68, 38, 58, 78, 88];
                    return (
                      <div key={i} className="aspect-square rounded-lg transition-transform hover:scale-110"
                        style={{ backgroundColor: `hsl(142 70% 45% / ${opacities[i]}%)` }} />
                    );
                  })}
                </div>
                <div className="flex justify-between mt-3 text-[10px] text-muted-foreground">
                  <span>← Recência</span>
                  <span>Frequência →</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Campeões", val: "23%" },
                    { label: "Em risco", val: "14%" },
                    { label: "Hibernando", val: "8%" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl bg-muted/40 border border-border/20 p-2.5">
                      <p className="text-sm font-bold text-foreground">{s.val}</p>
                      <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Shipping */}
          <motion.div variants={staggerItem}>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm h-full">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5 font-medium">
                  <Truck className="h-3.5 w-3.5 text-primary" /> Painel de Envios
                </p>
                <div className="space-y-2.5">
                  {[
                    { code: "BR7391024", status: "Em trânsito", dotColor: "bg-yellow-500" },
                    { code: "BR8204815", status: "Entregue", dotColor: "bg-primary" },
                    { code: "BR6519203", status: "Postado", dotColor: "bg-blue-400" },
                  ].map((s) => (
                    <div key={s.code} className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/20">
                      <div className="flex items-center gap-3">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-mono text-foreground">{s.code}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`h-2 w-2 rounded-full ${s.dotColor}`} />
                        <span className="text-xs text-muted-foreground">{s.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Bulk campaign */}
          <motion.div variants={staggerItem}>
            <Card className="border-border/30 bg-card/80 backdrop-blur-sm h-full">
              <CardContent className="p-6">
                <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1.5 font-medium">
                  <Send className="h-3.5 w-3.5 text-primary" /> Disparo em Massa
                </p>
                <div className="rounded-xl bg-muted/40 border border-border/20 p-4 mb-4">
                  <p className="text-[10px] text-muted-foreground mb-1.5 uppercase tracking-wider">Template</p>
                  <p className="text-sm text-foreground leading-relaxed">Olá {"{{nome}}"}, seu cupom de 15% está te esperando! Use <span className="font-mono text-primary font-medium">{"{{cupom}}"}</span> até {"{{validade}}"}.</p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" /> 1.240</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> 09:00</span>
                  </div>
                  <Badge className="text-[10px] bg-primary/10 text-primary border-0 hover:bg-primary/10 rounded-full px-3">Pronto</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
