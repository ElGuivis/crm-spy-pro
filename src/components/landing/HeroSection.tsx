import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import {
  ArrowRight, Check, Sparkles, Play, ChevronDown,
  TrendingUp, ShoppingCart, MessageSquare, Clock, Users,
} from "lucide-react";

function DashboardMockup() {
  return (
    <div className="grid grid-cols-3 gap-3 md:gap-4">
      {[
        { label: "Receita (30d)", value: "R$ 84.230", icon: TrendingUp, trend: "+12%" },
        { label: "Pedidos", value: "312", icon: ShoppingCart, trend: "+8%" },
        { label: "Mensagens", value: "1.847", icon: MessageSquare, trend: "+24%" },
      ].map((s) => (
        <div key={s.label} className="rounded-xl bg-muted/30 border border-border/30 p-3 md:p-4">
          <div className="flex items-center justify-between mb-2">
            <s.icon className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-medium text-primary">{s.trend}</span>
          </div>
          <p className="text-lg md:text-xl font-bold text-foreground">{s.value}</p>
          <span className="text-[10px] text-muted-foreground">{s.label}</span>
        </div>
      ))}

      <div className="col-span-2 rounded-xl bg-muted/30 border border-border/30 p-4">
        <p className="text-xs text-muted-foreground mb-3">Vendas — últimos 7 dias</p>
        <div className="flex items-end gap-2 h-24">
          {[35, 55, 40, 75, 50, 85, 65].map((h, i) => (
            <div key={i} className="flex-1 rounded-md gradient-whatsapp transition-all" style={{ height: `${h}%`, opacity: 0.7 + (i * 0.04) }} />
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-muted/30 border border-border/30 p-3">
        <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Conversas
        </p>
        {[
          { name: "Maria S.", msg: "Meu pedido já saiu?", time: "2min" },
          { name: "João P.", msg: "Quero trocar a cor", time: "8min" },
          { name: "Ana L.", msg: "Obrigada!", time: "12min" },
        ].map((c) => (
          <div key={c.name} className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-foreground">{c.name}</p>
              <p className="text-[9px] text-muted-foreground truncate">{c.msg}</p>
            </div>
            <span className="text-[9px] text-muted-foreground ml-2 shrink-0">{c.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroSection() {
  const { user, loading } = useAuth();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden">
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div className="absolute top-1/3 right-0 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-[100px]" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-[80px]" />
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 pt-16">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
            <Badge variant="outline" className="mb-8 px-5 py-2 text-xs font-medium border-primary/20 text-primary rounded-full backdrop-blur-sm bg-primary/[0.05]">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              CRM operacional para e-commerce brasileiro
            </Badge>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.35 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight text-foreground mb-6">
            Pedidos, WhatsApp e envios.{" "}
            <span className="text-gradient">Tudo em uma tela.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }}
            className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-10 max-w-2xl mx-auto">
            Centralize sua operação <strong className="text-foreground">e fidelize seus clientes</strong> com cashback automático,
            Matriz RFM e campanhas inteligentes — tudo integrado ao seu e-commerce brasileiro.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.65 }}
            className="flex flex-col sm:flex-row gap-4 justify-center">
            {!loading && user ? (
              <Button asChild size="xl" className="gradient-whatsapp shadow-glow font-semibold text-base rounded-full px-10">
                <Link to="/dashboard">Acessar meu painel <ArrowRight className="ml-2 h-5 w-5" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild size="xl" className="gradient-whatsapp shadow-glow font-semibold text-base rounded-full px-10">
                  <Link to="/auth">Comece agora — é grátis <ArrowRight className="ml-2 h-5 w-5" /></Link>
                </Button>
                <Button asChild variant="outline" size="xl" className="rounded-full px-8 border-border/60">
                  <a href="#como-funciona">
                    <Play className="mr-2 h-4 w-4" /> Ver como funciona
                  </a>
                </Button>
              </>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1 }}
            className="mt-12 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Sem cartão de crédito</span>
            <span className="hidden sm:flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> Setup em 5 minutos</span>
            <span className="flex items-center gap-1.5"><Check className="h-4 w-4 text-primary" /> 100% no navegador</span>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 60, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.8, ease: [0.25, 0.4, 0.25, 1] }} className="mt-16 max-w-5xl mx-auto">
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl" style={{ boxShadow: "var(--shadow-glow-lg)" }} />
            <div className="relative rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl p-1 shadow-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-primary/60" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-muted/50 rounded-md h-6 max-w-xs mx-auto flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">app.spypro.com.br/dashboard</span>
                  </div>
                </div>
              </div>
              <div className="p-4 md:p-6">
                <DashboardMockup />
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }} className="flex justify-center mt-12 pb-8">
          <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
            <ChevronDown className="h-5 w-5 text-muted-foreground/50" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
