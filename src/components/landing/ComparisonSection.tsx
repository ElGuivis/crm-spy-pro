import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, X, Check, Gift, BarChart3, Heart } from "lucide-react";
import { AnimatedSection } from "./AnimationHelpers";

export function ComparisonSection() {
  const outrosItems = [
    "Generalistas, sem foco em e-commerce brasileiro",
    "Sem integração com Loja Integrada ou Bling",
    "WhatsApp? Só via API cara ou integrações frágeis",
    "Métricas bonitas, mas você não opera nada",
    "Envios? Abra outra aba",
  ];

  const spyproItems = [
    "Feito para e-commerce brasileiro",
    "Loja Integrada + Bling + Melhor Envio nativos",
    "WhatsApp com IA + chatbot no mesmo painel",
    "Opere de verdade: atenda, automatize, dispare",
    "Envios, rastreio e status em tempo real",
  ];

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden bg-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative">
        <AnimatedSection className="text-center max-w-2xl mx-auto mb-16">
          <Badge variant="outline" className="mb-5 border-primary/20 text-primary text-xs rounded-full px-5 py-1.5">
            Comparativo
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Por que o SpyPro é{" "}
            <span className="text-gradient">diferente?</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            CRMs genéricos não foram feitos para a realidade do lojista brasileiro.
          </p>
        </AnimatedSection>

        <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
          <AnimatedSection>
            <Card className="border-destructive/20 bg-destructive/[0.02] h-full">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  </div>
                  <h3 className="font-bold text-foreground text-lg">Outros CRMs</h3>
                </div>
                <ul className="space-y-4">
                  {outrosItems.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <div className="h-5 w-5 rounded-full bg-destructive/10 flex items-center justify-center mt-0.5 shrink-0">
                        <X className="h-3 w-3 text-destructive" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </AnimatedSection>

          <AnimatedSection delay={0.15}>
            <Card className="border-primary/20 bg-primary/[0.02] h-full relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 blur-[60px]" />
              <CardContent className="p-6 md:p-8 relative">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-xl gradient-whatsapp flex items-center justify-center shadow-glow">
                    <Check className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <h3 className="font-bold text-foreground text-lg">Com o SpyPro</h3>
                  <Badge className="ml-auto text-[10px] bg-primary/10 text-primary border-0 hover:bg-primary/10 rounded-full px-3">Recomendado</Badge>
                </div>
                <ul className="space-y-4">
                  {spyproItems.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-foreground">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                        <Check className="h-3 w-3 text-primary" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </AnimatedSection>
        </div>

        <AnimatedSection delay={0.3} className="mt-12 max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: Gift, text: "Cashback automático em cada venda — sem intervenção manual" },
              { icon: BarChart3, text: "Clientes em risco identificados antes de pararem de comprar" },
              { icon: Heart, text: "Cupom de aniversário gerado e enviado por WhatsApp sozinho" },
            ].map((r) => (
              <div key={r.text} className="flex items-start gap-3 p-4 rounded-xl border border-primary/10 bg-card/60">
                <div className="h-8 w-8 rounded-lg bg-primary/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                  <r.icon className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
