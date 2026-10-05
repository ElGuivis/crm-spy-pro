import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { RecoveryTab } from "@/components/email-marketing/recovery/RecoveryTab";

/** Automação → Recuperação LI: carrinho/navegação/pedido abandonado, boas-vindas, newsletter, reposição, regras de contato e a loja. */
const RecuperacaoLI = () => (
  <PageTransition>
    <div className="p-6 space-y-6">
      <PageHeader
        title="Recuperação LI"
        subtitle="Recupere carrinhos e pedidos abandonados da Loja Integrada por e-mail e WhatsApp"
        icon={ShoppingCart}
      />
      <RecoveryTab />
    </div>
  </PageTransition>
);

export default RecuperacaoLI;
