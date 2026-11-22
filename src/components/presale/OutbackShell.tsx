import { ReactNode, useEffect } from "react";
import { motion } from "framer-motion";
import heroBg from "@/assets/outback/hero-bg.jpg";
import logo from "@/assets/outback/logo.png";

// Moldura visual da OUT/BACK! (mesma do formulário antigo "fimdaout"): fundo quase preto com foto a 20%,
// ruído, Bebas Neue nos títulos, Space Grotesk no texto, acento vermelho. Usada por /vip e /cadastro.
const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600&display=swap";
const NOISE = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";
export const DISPLAY = "font-['Bebas_Neue']";

interface Props {
  pageTitle: string;
  eyebrow: string;
  headline: ReactNode;   // linha cheia
  outline: ReactNode;    // linha vazada
  intro: ReactNode;
  children: ReactNode;   // conteúdo do cartão
}

export function OutbackShell({ pageTitle, eyebrow, headline, outline, intro, children }: Props) {
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONTS_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = FONTS_HREF;
      document.head.appendChild(link);
    }
    const prev = document.title;
    document.title = pageTitle;
    return () => { document.title = prev; };
  }, [pageTitle]);

  return (
    <div className="min-h-[100dvh] bg-[#080808] text-[#f2f2f2] relative overflow-hidden font-['Space_Grotesk',sans-serif]">
      <div className="absolute inset-0 z-0" aria-hidden="true">
        <img src={heroBg} alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080808]/50 via-[#080808]/80 to-[#080808]" />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: NOISE }} />
      </div>

      <main className="relative z-10 min-h-[100dvh] flex flex-col items-center px-4 sm:px-5 py-8 sm:py-12">
        <div className="max-w-2xl w-full mx-auto text-center">
          <motion.img initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
            src={logo} alt="OUT/BACK! Multimarcas" className="h-20 sm:h-28 mx-auto brightness-0 invert mb-3" />
          <p className="text-[10px] sm:text-sm uppercase tracking-[0.3em] text-white/50 mb-8 sm:mb-12">{eyebrow}</p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }} className="space-y-4 mb-8 sm:mb-12">
            <h1 className={`${DISPLAY} text-[2.6rem] sm:text-6xl md:text-7xl leading-[1.05] tracking-tight`}>
              {headline}
              <br />
              <span className="text-transparent [-webkit-text-stroke:1px_#f2f2f2] sm:[-webkit-text-stroke:2px_#f2f2f2]">{outline}</span>
            </h1>
            <div className="flex items-center gap-4 justify-center" aria-hidden="true">
              <div className="h-px w-10 bg-[#dc2828]" />
              <span className={`${DISPLAY} text-[#dc2828] text-xl`}>×</span>
              <div className="h-px w-10 bg-[#dc2828]" />
            </div>
            <p className="text-base sm:text-lg text-[#f2f2f2]/85 leading-[1.7] max-w-lg mx-auto">{intro}</p>
          </motion.div>

          <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="bg-[#141414]/90 backdrop-blur-sm border border-[#2e2e2e] p-5 sm:p-8 max-w-md mx-auto" aria-labelledby="presale-title">
            {children}
          </motion.section>

          <p className="mt-8 text-[10px] sm:text-xs text-white/40 uppercase tracking-[0.2em] pb-6">OUT/BACK! Multimarcas · 12 anos de streetwear</p>
        </div>
      </main>
    </div>
  );
}

export function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h2 id="presale-title" className={`${DISPLAY} text-3xl sm:text-4xl tracking-wide mb-2`}>{title}</h2>
      <p className="text-sm sm:text-base text-white/70 mb-6">{subtitle}</p>
    </>
  );
}
