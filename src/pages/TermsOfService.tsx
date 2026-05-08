import { Link } from "react-router-dom";
import { SpyProLogo } from "@/components/common/SpyProLogo";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const TermsOfService = () => {
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
        <h1 className="text-3xl font-bold mb-2">Termos de Serviço</h1>
        <p className="text-muted-foreground mb-8">Última atualização: 1 de março de 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6 text-foreground/90 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar ou utilizar a plataforma SpyPro CRM, você concorda em cumprir e estar vinculado a estes 
              Termos de Serviço. Se você não concordar com qualquer parte destes termos, não deverá utilizar nossos serviços.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. Descrição do Serviço</h2>
            <p>
              A SpyPro CRM é uma plataforma de gestão de relacionamento com o cliente (CRM) que oferece funcionalidades 
              de automação de marketing, atendimento ao cliente via WhatsApp e Instagram, integração com e-commerces, 
              gestão de envios, campanhas em massa, análise RFM e inteligência artificial aplicada ao negócio.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Cadastro e Conta</h2>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Você deve fornecer informações verdadeiras e atualizadas ao se cadastrar.</li>
              <li>Você é responsável por manter a confidencialidade da sua senha e conta.</li>
              <li>Você é responsável por todas as atividades realizadas sob sua conta.</li>
              <li>Você deve notificar imediatamente sobre qualquer uso não autorizado da sua conta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Uso Aceitável</h2>
            <p>Ao utilizar nossos serviços, você concorda em NÃO:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Enviar spam ou mensagens não solicitadas em massa.</li>
              <li>Violar leis aplicáveis, incluindo a LGPD e regulamentações de telecomunicações.</li>
              <li>Utilizar a plataforma para atividades fraudulentas ou ilegais.</li>
              <li>Tentar acessar sistemas ou dados de outros usuários sem autorização.</li>
              <li>Realizar engenharia reversa ou tentar extrair o código-fonte da plataforma.</li>
              <li>Sobrecarregar intencionalmente a infraestrutura do serviço.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. Tokens e Pagamento</h2>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Algumas funcionalidades consomem tokens conforme descrito na plataforma.</li>
              <li>Os planos e preços estão sujeitos a alterações com aviso prévio de 30 dias.</li>
              <li>Reembolsos serão tratados conforme o Código de Defesa do Consumidor.</li>
              <li>O não pagamento pode resultar na suspensão ou cancelamento da conta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Integrações com Terceiros</h2>
            <p>
              A plataforma permite integração com serviços de terceiros (Bling, Loja Integrada, Melhor Envio, 
              WhatsApp via Evolution API, Instagram, provedores de IA, etc.). Nós não nos responsabilizamos por:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Indisponibilidade ou mudanças nos serviços de terceiros.</li>
              <li>Dados incorretos provenientes de integrações externas.</li>
              <li>Violações dos termos de uso de plataformas terceiras pelo usuário.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo, design, código e funcionalidades da plataforma SpyPro CRM são de propriedade 
              exclusiva da Empresa. Os dados que você insere na plataforma permanecem de sua propriedade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">8. Limitação de Responsabilidade</h2>
            <p>
              Na máxima extensão permitida por lei, a SpyPro CRM não será responsável por danos indiretos, 
              incidentais, especiais ou consequenciais resultantes do uso ou impossibilidade de uso dos serviços, 
              incluindo perda de dados, lucros cessantes ou interrupção de negócios.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">9. Disponibilidade do Serviço</h2>
            <p>
              Nos esforçamos para manter a plataforma disponível 24/7, mas não garantimos disponibilidade 
              ininterrupta. Manutenções programadas serão comunicadas com antecedência quando possível.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">10. Cancelamento</h2>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>Você pode cancelar sua conta a qualquer momento nas configurações.</li>
              <li>Reservamo-nos o direito de suspender ou encerrar contas que violem estes termos.</li>
              <li>Após o cancelamento, seus dados serão retidos por 30 dias antes da exclusão permanente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">11. Alterações nos Termos</h2>
            <p>
              Podemos modificar estes Termos de Serviço a qualquer momento. Mudanças significativas serão 
              notificadas por e-mail ou através da plataforma com pelo menos 15 dias de antecedência.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">12. Legislação Aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será 
              submetida ao foro da comarca da sede da Empresa.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">13. Contato</h2>
            <p>
              Para dúvidas sobre estes Termos de Serviço, entre em contato:{" "}
              <a href="mailto:contato@spypro.com.br" className="text-primary underline">contato@spypro.com.br</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
