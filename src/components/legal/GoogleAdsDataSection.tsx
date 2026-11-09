const EMAIL = "adm.usechronic@gmail.com";
const PERMISSIONS_URL = "https://myaccount.google.com/permissions";

const link = "text-primary underline";

/** Seção de uso dos dados do Google Ads (exigida na verificação OAuth do Google). */
export function GoogleAdsDataSection() {
  return (
    <section id="google-ads">
      <h2 className="text-xl font-semibold mt-8 mb-3">Dados do Google Ads / Google Ads Data</h2>

      <div lang="pt-BR" className="space-y-4">
        <p>
          O SpyPro Ads Manager é uma ferramenta de uso interno da SpyPro para gerenciar e otimizar contas do
          Google Ads de nossa propriedade. Quando um administrador autoriza o acesso via login do Google
          (OAuth), o aplicativo acessa dados do Google Ads, como campanhas, grupos de anúncios, palavras-chave,
          termos de pesquisa, orçamentos e métricas de desempenho (impressões, cliques, custo e conversões).
        </p>
        <p className="font-medium">Como usamos esses dados:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Gerar relatórios e painéis de desempenho.</li>
          <li>Analisar o desempenho e recomendar otimizações.</li>
          <li>Aplicar alterações na conta (como orçamento, lances e pausa de anúncios) somente após aprovação de um membro da equipe.</li>
        </ul>
        <p className="font-medium">O que NÃO fazemos:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Não vendemos, alugamos nem compartilhamos dados do Google Ads com terceiros.</li>
          <li>Não usamos esses dados para publicidade personalizada nem para treinar modelos de uso geral.</li>
          <li>Não permitimos que pessoas leiam esses dados, exceto com consentimento, para segurança, por exigência legal ou para operar o próprio serviço.</li>
        </ul>
        <p>
          O uso e a transferência, para qualquer outro aplicativo, das informações recebidas das APIs do Google
          seguirão a Política de Dados de Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado.
        </p>
        <p>
          <strong>Armazenamento e exclusão:</strong> os dados ficam em sistemas protegidos da SpyPro. O acesso pode
          ser revogado a qualquer momento em{" "}
          <a href={PERMISSIONS_URL} className={link} rel="noopener noreferrer">{PERMISSIONS_URL}</a>. Para pedir a
          exclusão dos dados, escreva para <a href={`mailto:${EMAIL}`} className={link}>{EMAIL}</a>.
        </p>
      </div>

      <div lang="en" className="space-y-4 mt-8">
        <p>
          SpyPro Ads Manager is an internal tool operated by SpyPro to manage and optimize Google Ads accounts that
          we own. When an administrator grants access through Google Sign-In (OAuth), the app accesses Google Ads
          data such as campaigns, ad groups, keywords, search terms, budgets and performance metrics (impressions,
          clicks, cost, conversions).
        </p>
        <p className="font-medium">How we use this data:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>To generate performance reports and dashboards.</li>
          <li>To analyze performance and recommend optimizations.</li>
          <li>To apply account changes (such as budgets, bids and pausing ads) only after approval by a team member.</li>
        </ul>
        <p className="font-medium">What we do NOT do:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>We do not sell, rent or share Google Ads data with third parties.</li>
          <li>We do not use it for personalized advertising or to train general-purpose AI models.</li>
          <li>We do not allow humans to read this data, except with consent, for security purposes, to comply with law, or to operate the service.</li>
        </ul>
        <p>
          SpyPro Ads Manager's use and transfer to any other app of information received from Google APIs will
          adhere to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className={link} rel="noopener noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          <strong>Storage and deletion:</strong> data is kept on SpyPro's secured systems. Access can be revoked at
          any time at{" "}
          <a href={PERMISSIONS_URL} className={link} rel="noopener noreferrer">{PERMISSIONS_URL}</a>. To request
          deletion of data, email <a href={`mailto:${EMAIL}`} className={link}>{EMAIL}</a>.
        </p>
      </div>
    </section>
  );
}
