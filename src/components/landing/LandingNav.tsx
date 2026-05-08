import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SpyProLogo } from "@/components/common/SpyProLogo";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function LandingNav() {
  const { user, loading } = useAuth();

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-background/70 border-b border-border/30"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <SpyProLogo size="md" showText />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#funcionalidades" className="hover:text-foreground transition-colors">Funcionalidades</a>
          <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </div>

        <div className="flex items-center gap-3">
          {!loading && user ? (
            <Button asChild size="sm" className="gradient-whatsapp font-semibold rounded-full px-5">
              <Link to="/dashboard">Acessar painel <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/auth">Entrar</Link>
              </Button>
              <Button asChild size="sm" className="gradient-whatsapp font-semibold rounded-full px-5">
                <Link to="/auth">Começar grátis</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.nav>
  );
}
