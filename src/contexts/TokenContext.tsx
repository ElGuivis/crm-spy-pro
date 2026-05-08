import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export interface Plan {
  id: string;
  name: string;
  tokens: number;
  price: number;
}

export interface TokenUsage {
  id: string;
  type: string;
  description: string;
  tokens: number;
  timestamp: Date;
  balance_after: number;
}

interface TokenContextType {
  balance: number;
  plan: Plan | null;
  usage: TokenUsage[];
  plans: Plan[];
  isLoading: boolean;
  refetchBalance: () => Promise<void>;
  refetchUsage: () => Promise<void>;
}

const TokenContext = createContext<TokenContextType | undefined>(undefined);

export function TokenProvider({ children }: { children: ReactNode }) {
  const { tenantId } = useAuth();
  const [balance, setBalance] = useState(0);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<TokenUsage[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPlans = async () => {
    const { data } = await supabase
      .from('token_plans')
      .select('id, name, tokens, price')
      .eq('is_active', true)
      .order('tokens', { ascending: true });

    if (data) {
      setPlans(data.map(p => ({
        id: p.id,
        name: p.name,
        tokens: p.tokens,
        price: Number(p.price),
      })));
    }
  };

  const fetchBalance = async () => {
    if (!tenantId) return;

    const { data } = await supabase
      .from('tenant_tokens')
      .select('balance, plan_id, token_plans(id, name, tokens, price)')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (data) {
      setBalance(data.balance);
      if (data.token_plans) {
        setPlan({
          id: data.token_plans.id,
          name: data.token_plans.name,
          tokens: data.token_plans.tokens,
          price: Number(data.token_plans.price),
        });
      }
    }
  };

  const fetchUsage = async () => {
    if (!tenantId) return;

    const { data } = await supabase
      .from('token_transactions')
      .select('id, type, description, amount, balance_after, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setUsage(data.map(t => ({
        id: t.id,
        type: t.type,
        description: t.description || t.type,
        tokens: Math.abs(t.amount),
        timestamp: new Date(t.created_at),
        balance_after: t.balance_after,
      })));
    }
  };

  const refetchBalance = async () => {
    await fetchBalance();
  };

  const refetchUsage = async () => {
    await fetchUsage();
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  useEffect(() => {
    if (tenantId) {
      setIsLoading(true);
      Promise.all([fetchBalance(), fetchUsage()]).finally(() => {
        setIsLoading(false);
      });

      // Subscribe to realtime changes
      const channel = supabase
        .channel('token_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tenant_tokens',
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => {
            fetchBalance();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'token_transactions',
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => {
            fetchUsage();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [tenantId]);

  return (
    <TokenContext.Provider
      value={{
        balance,
        plan,
        usage,
        plans,
        isLoading,
        refetchBalance,
        refetchUsage,
      }}
    >
      {children}
    </TokenContext.Provider>
  );
}

export function useTokens() {
  const context = useContext(TokenContext);
  if (context === undefined) {
    throw new Error('useTokens must be used within a TokenProvider');
  }
  return context;
}
