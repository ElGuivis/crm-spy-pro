import { Link } from "react-router-dom";
import { SpyProLogo } from "@/components/common/SpyProLogo";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <SpyProLogo size="sm" />
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground mb-8">Última atualização: 1 de março de 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Introdução</h2>
            <p>
              A SpyPro CRM ("nós", "nosso" ou "Empresa") está comprometida em proteger a privacidade dos nossos usuários. 
              Esta Política de Privacidade explica como coletamos, usamos, armazenamos e protegemos suas informações pessoais 
              quando você utiliza nossa plataforma de CRM e automação.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Informações que Coletamos</h2>
            <p>Podemos coletar os seguintes tipos de informações:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Dados de cadastro:</strong> nome, e-mail, telefone e informações da empresa.</li>
              <li><strong>Dados de uso:</strong> interações com a plataforma, logs de acesso, funcionalidades utilizadas.</li>
              <li><strong>Dados de integrações:</strong> informações provenientes de serviços terceiros conectados (ex.: Bling, Loja Integrada, Melhor Envio, WhatsApp, Instagram), conforme autorizado por você.</li>
              <li><strong>Dados de clientes:</strong> informações de contatos e clientes que você gerencia através da plataforma.</li>
              <li><strong>Dados de pagamento:</strong> processados por provedores terceiros seguros; não armazenamos dados completos de cartão.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Como Usamos suas Informações</h2>
            <p>Utilizamos suas informações para:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Fornecer, manter e melhorar nossos serviços.</li>
              <li>Processar automações, campanhas e comunicações configuradas por você.</li>
              <li>Enviar notificações relacionadas ao serviço.</li>
              <li>Fornecer suporte técnico.</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
              <li>Gerar análises e relatórios agregados para melhorar a plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Compartilhamento de Dados</h2>
            <p>
              Não vendemos seus dados pessoais. Podemos compartilhar informações com:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Provedores de serviço:</strong> empresas que nos auxiliam na operação da plataforma (hospedagem, processamento de pagamentos, envio de mensagens).</li>
              <li><strong>Integrações autorizadas:</strong> serviços terceiros que você conectou à sua conta.</li>
              <li><strong>Obrigações legais:</strong> quando exigido por lei, ordem judicial ou processo legal.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Segurança dos Dados</h2>
            <p>
              Implementamos medidas técnicas e organizacionais apropriadas para proteger suas informações, 
              incluindo criptografia em trânsito e em repouso, controle de acesso baseado em funções e 
              monitoramento contínuo de segurança.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Retenção de Dados</h2>
            <p>
              Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para fornecer nossos serviços. 
              Você pode solicitar a exclusão dos seus dados a qualquer momento através das configurações da conta ou 
              entrando em contato conosco.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Seus Direitos (LGPD)</h2>
            <p>De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem direito a:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Confirmar a existência de tratamento de dados.</li>
              <li>Acessar seus dados pessoais.</li>
              <li>Corrigir dados incompletos ou desatualizados.</li>
              <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários.</li>
              <li>Solicitar a portabilidade dos dados.</li>
              <li>Revogar o consentimento a qualquer momento.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Cookies</h2>
            <p>
              Utilizamos cookies e tecnologias similares para melhorar sua experiência, 
              analisar o tráfego e personalizar conteúdo. Você pode gerenciar suas preferências 
              de cookies através das configurações do seu navegador.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre mudanças 
              significativas por e-mail ou através de aviso na plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Contato</h2>
            <p>
              Para questões relacionadas à privacidade, entre em contato conosco pelo e-mail:{" "}
              <a href="mailto:contato@spypro.com.br" className="text-primary underline">contato@spypro.com.br</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
