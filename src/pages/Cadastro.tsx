import { useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { RegisterForm } from "@/components/presale/RegisterForm";
import { CardTitle, DISPLAY, OutbackShell } from "@/components/presale/OutbackShell";

// Página pública de cadastro (/cadastro/:slug): link mandado no atendimento do WhatsApp.
// O cadastro vira contato no Bling da loja, para lançar a venda no nome da pessoa.

export default function Cadastro() {
  const { slug = "" } = useParams();
  const [done, setDone] = useState(false);

  return (
    <OutbackShell
      pageTitle="OUT/BACK! · Cadastro"
      eyebrow="Cadastro · Teu pedido"
      headline="FALTA POUCO"
      outline="PRO TEU PEDIDO."
      intro={<>Preenche teus dados aqui que a gente lança o pedido no teu nome e manda tudo certinho pro teu endereço.</>}
    >
      {done ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center" role="status">
          <h3 className={`${DISPLAY} text-4xl text-[#f2f2f2] tracking-wide mb-3`}>CADASTRO FEITO!</h3>
          <p className="text-[#f2f2f2]/80">Agora é com a gente. Pode voltar pro WhatsApp que a gente segue com teu pedido por lá.</p>
        </motion.div>
      ) : (
        <>
          <CardTitle title="TEUS DADOS" subtitle="O endereço completa sozinho quando tu digita o CEP." />
          <RegisterForm slug={slug} onDone={() => setDone(true)} />
        </>
      )}
    </OutbackShell>
  );
}
