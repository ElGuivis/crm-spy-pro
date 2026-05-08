import { useState } from 'react';
import { Coins, Check, Sparkles, Gift, Loader2 } from 'lucide-react';
import { useTokens } from '@/contexts/TokenContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { TokenBalance } from '@/components/tokens/TokenBalance';
import { TokenUsageCard } from '@/components/tokens/TokenUsageCard';

import { createLogger } from '@/lib/logger';
const log = createLogger('Tokens');

export default function TokensPage() {
  const { plans, plan: currentPlan, balance, refetchBalance, refetchUsage } = useTokens();
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAddTokens = async (amount: number, description: string) => {
    if (!tenantId) {
      toast({
        title: "Erro",
        description: "Não foi possível identificar sua conta.",
        variant: "destructive"
      });
      return;
    }

    const fetchServerBalance = async () => {
      const { data, error } = await supabase.rpc('get_tenant_token_balance', {
        _tenant_id: tenantId,
      });

      if (error) throw error;
      return data ?? balance;
    };

    let balanceBefore = balance;

    setIsLoading(true);
    try {
      balanceBefore = await fetchServerBalance();

      const { error } = await supabase.rpc('add_tokens', {
        _tenant_id: tenantId,
        _amount: amount,
        _type: 'credit',
        _description: description,
      });

      if (error) throw error;

      toast({
        title: "Tokens adicionados!",
        description: `${amount.toLocaleString('pt-BR')} tokens foram creditados na sua conta.`,
      });

      await refetchBalance();
      await refetchUsage();
      setSelectedPlan(null);
      setCustomAmount('');
    } catch (error) {
      const rpcError = error as { code?: string };

      if (rpcError?.code === '57014') {
        try {
          const balanceAfter = await supabase.rpc('get_tenant_token_balance', {
            _tenant_id: tenantId,
          });

          if (!balanceAfter.error && (balanceAfter.data ?? 0) >= balanceBefore + amount) {
            await refetchBalance();
            await refetchUsage();

            toast({
              title: "Tokens adicionados!",
              description: "A operação demorou para responder, mas os tokens já foram creditados.",
            });

            setSelectedPlan(null);
            setCustomAmount('');
            return;
          }
        } catch {
          // mantém fallback de erro abaixo
        }

        toast({
          title: "Operação em processamento",
          description: "A adição de tokens excedeu o tempo de resposta. Aguarde alguns segundos e tente novamente.",
          variant: "destructive"
        });
        return;
      }

      log.error('Error adding tokens:', error);
      toast({
        title: "Erro ao adicionar tokens",
        description: "Ocorreu um erro ao processar sua solicitação.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlanPurchase = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      handleAddTokens(plan.tokens, `Compra do plano ${plan.name}`);
    }
  };

  const handleCustomPurchase = () => {
    const amount = parseInt(customAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Quantidade inválida",
        description: "Digite uma quantidade válida de tokens.",
        variant: "destructive"
      });
      return;
    }
    handleAddTokens(amount, `Crédito avulso de ${amount} tokens`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tokens</h1>
          <p className="text-muted-foreground">Gerencie seus créditos e escolha um plano</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Balance and Usage */}
        <div className="space-y-6">
          <TokenBalance variant="card" />
          <TokenUsageCard limit={10} />
        </div>

        {/* Right Column - Plans */}
        <div className="lg:col-span-2 space-y-6">
          {/* Free Credits Banner */}
          <div className="p-6 rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20 border border-primary/30">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/20">
                <Gift className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">Período Promocional</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Durante o período de testes, você pode adicionar tokens gratuitamente! 
                  Aproveite para testar todas as funcionalidades.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    placeholder="Quantidade de tokens"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="max-w-[200px]"
                    min={1}
                  />
                  <Button 
                    onClick={handleCustomPurchase}
                    disabled={isLoading || !customAmount}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Adicionar Grátis
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Plans Grid */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Planos Disponíveis</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan, index) => {
                const isPopular = index === 1;
                const isCurrentPlan = currentPlan?.id === plan.id;
                
                return (
                  <div
                    key={plan.id}
                    className={cn(
                      "relative p-6 rounded-xl border transition-all",
                      isPopular 
                        ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" 
                        : "border-border/50 bg-card hover:border-primary/50",
                      selectedPlan === plan.id && "ring-2 ring-primary"
                    )}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="px-3 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                          Mais Popular
                        </span>
                      </div>
                    )}

                    {isCurrentPlan && (
                      <div className="absolute top-3 right-3">
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-500 rounded-full">
                          Atual
                        </span>
                      </div>
                    )}

                    <div className="text-center mb-4">
                      <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                      <div className="mt-2">
                        <span className="text-3xl font-bold text-foreground">
                          R$ {plan.price.toFixed(2).replace('.', ',')}
                        </span>
                        <span className="text-muted-foreground">/mês</span>
                      </div>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-sm">
                        <Coins className="h-4 w-4 text-primary" />
                        <span className="text-foreground">
                          <strong>{plan.tokens.toLocaleString('pt-BR')}</strong> tokens/mês
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Automações ilimitadas</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Integrações completas</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Suporte por chat</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => handlePlanPurchase(plan.id)}
                      disabled={isLoading}
                      variant={isPopular ? "default" : "outline"}
                      className="w-full"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>Adicionar {plan.tokens.toLocaleString('pt-BR')} tokens</>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Token Costs Info */}
          <div className="p-4 rounded-xl border border-border/50 bg-card">
            <h3 className="font-semibold text-foreground mb-3">Custo de Tokens</h3>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Automação de Cashback</span>
                <span className="font-medium text-foreground">1 token</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Lembrete de Cupom</span>
                <span className="font-medium text-foreground">1 token</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <span className="text-muted-foreground">Adicionar Membro da Equipe</span>
                <span className="font-medium text-foreground">10 tokens</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Sincronização de Dados</span>
                <span className="font-medium text-foreground">5 tokens</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
