import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { GroupForm } from "@/components/presale/GroupForm";
import { CardTitle, DISPLAY, OutbackShell } from "@/components/presale/OutbackShell";

// Página pública do grupo VIP da pré-venda (/vip/:slug): formulário curto -> planilha -> grupo do WhatsApp.

function Success({ groupUrl }: { groupUrl: string | null }) {
  useEffect(() => {
    if (!groupUrl) return;
    const t = window.setTimeout(() => window.location.assign(groupUrl), 2500);
    return () => window.clearTimeout(t);
  }, [groupUrl]);

  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center" role="status">
      <h3 className={`${DISPLAY} text-4xl text-[#f2f2f2] tracking-wide mb-3`}>TÁ DENTRO!</h3>
      <p className="text-[#f2f2f2]/80 mb-6">Teu nome tá na lista. Agora entra no grupo, que é lá que o link da pré-venda cai primeiro.</p>
      {groupUrl ? (
        <a href={groupUrl} className={`block w-full bg-[#dc2828] text-white ${DISPLAY} text-xl tracking-[0.14em] py-4 rounded-[2px] hover:bg-[#f2f2f2] hover:text-[#080808] transition-colors`}>
          ENTRAR NO GRUPO VIP
        </a>
      ) : null}
      {groupUrl ? <p className="text-xs text-white/40 mt-3">Abrindo o WhatsApp…</p> : null}
    </motion.div>
  );
}

export default function PreVenda() {
  const { slug = "" } = useParams();
  const [groupUrl, setGroupUrl] = useState<string | null | undefined>(undefined);
  const [askingSizes, setAskingSizes] = useState(false);

  return (
    <OutbackShell
      pageTitle="OUT/BACK! · Pré-venda no grupo VIP"
      eyebrow="Pré-venda · Acesso antecipado"
      headline="QUEM É DA CASA"
      outline="CHEGA PRIMEIRO."
      intro={<>A pré-venda da nova fase abre primeiro no nosso grupo do WhatsApp.
        Bota teu nome aqui embaixo, entra no grupo e o link chega pra ti antes de abrir pra geral.</>}
    >
      {groupUrl === undefined ? (
        <>
          {askingSizes ? null : <CardTitle title="BOTA TEU NOME NA LISTA" subtitle="Leva menos de um minuto. Depois é só entrar no grupo." />}
          <GroupForm slug={slug} onDone={setGroupUrl} onSizesStep={() => setAskingSizes(true)} />
        </>
      ) : (
        <Success groupUrl={groupUrl} />
      )}
    </OutbackShell>
  );
}
