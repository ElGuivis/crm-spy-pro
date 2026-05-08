import React, { createContext, useContext } from 'react';
import { useNewOrdersNotification } from '@/hooks/useNewOrdersNotification';

interface NewOrdersContextType {
  newOrdersCount: number;
  markAllAsSeen: () => Promise<void>;
}

const NewOrdersContext = createContext<NewOrdersContextType | undefined>(undefined);

export function NewOrdersProvider({ children }: { children: React.ReactNode }) {
  const { newOrdersCount, markAllAsSeen } = useNewOrdersNotification();

  return (
    <NewOrdersContext.Provider value={{ newOrdersCount, markAllAsSeen }}>
      {children}
    </NewOrdersContext.Provider>
  );
}

export function useNewOrders() {
  const context = useContext(NewOrdersContext);
  if (context === undefined) {
    throw new Error('useNewOrders must be used within a NewOrdersProvider');
  }
  return context;
}
