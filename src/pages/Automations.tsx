import { useState } from 'react';
import { Gift, Bell, Cake, Plus, Coins, Loader2, Repeat } from 'lucide-react';

import { AutomationMainCard } from '@/components/automations/AutomationMainCard';
import { AutomationSubCard } from '@/components/automations/AutomationSubCard';
import { AutomationCreateCard } from '@/components/automations/AutomationCreateCard';
import { CashbackSubCard } from '@/components/automations/CashbackSubCard';
import { CashbackConfigDialog } from '@/components/automations/CashbackConfigDialog';
import { OrderNotificationConfigDialog } from '@/components/automations/OrderNotificationConfigDialog';
import { BirthdayConfigDialog } from '@/components/automations/BirthdayConfigDialog';
import { ReactivationConfigDialog } from '@/components/automations/ReactivationConfigDialog';
import { useAutomationsData } from '@/hooks/useAutomationsData';
import { useTokens } from '@/contexts/TokenContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const AutomationsPage = () => {
  const { balance } = useTokens();
  const data = useAutomationsData();

  // UI state
  const [cashbackExpanded, setCashbackExpanded] = useState(false);
  const [orderNotificationExpanded, setOrderNotificationExpanded] = useState(false);
  const [birthdayExpanded, setBirthdayExpanded] = useState(false);
  const [reactivationExpanded, setReactivationExpanded] = useState(false);

  // Dialog state
  const [cashbackDialogOpen, setCashbackDialogOpen] = useState(false);
  const [editingCashbackId, setEditingCashbackId] = useState<string | null>(null);
  const [orderNotificationDialogOpen, setOrderNotificationDialogOpen] = useState(false);
  const [editingOrderNotificationId, setEditingOrderNotificationId] = useState<string | null>(null);
  const [birthdayDialogOpen, setBirthdayDialogOpen] = useState(false);
  const [editingBirthdayId, setEditingBirthdayId] = useState<string | null>(null);
  const [reactivationDialogOpen, setReactivationDialogOpen] = useState(false);
  const [editingReactivationId, setEditingReactivationId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCashbackId, setDeletingCashbackId] = useState<string | null>(null);

  const openCashback = (id?: string) => {
    setEditingCashbackId(id || null);
    setCashbackDialogOpen(true);
  };

  const openOrderNotification = (id?: string) => {
    setEditingOrderNotificationId(id || null);
    setOrderNotificationDialogOpen(true);
  };

  const openBirthday = (id?: string) => {
    setEditingBirthdayId(id || null);
    setBirthdayDialogOpen(true);
  };

  const openReactivation = (id?: string) => {
    setEditingReactivationId(id || null);
    setReactivationDialogOpen(true);
  };

  const confirmDeleteCashback = (id: string) => {
    setDeletingCashbackId(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCashback = async () => {
    if (!deletingCashbackId) return;
    await data.deleteCashback(deletingCashbackId);
    setDeleteDialogOpen(false);
    setDeletingCashbackId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Automações</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus fluxos de automação</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
          <Coins className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">{balance.toLocaleString('pt-BR')} tokens</span>
        </div>
      </div>

      <div className="space-y-3">
        {/* Cashback */}
        <AutomationMainCard
          icon={<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Gift className="h-6 w-6" /></div>}
          title="Cashback"
          description="Cupons de desconto automáticos para fidelização"
          activeCount={data.activeConfigs}
          tokensPerExec={5}
          lastExecution={data.lastExecution}
          totalExecutions={data.totalCoupons}
          expanded={cashbackExpanded}
          onToggle={() => setCashbackExpanded(!cashbackExpanded)}
          onCreate={() => openCashback()}
        >
          <div className="ml-8 space-y-2 border-l-2 border-primary/20 pl-4">
            {data.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {data.cashbackConfigs.map(config => (
                  <CashbackSubCard
                    key={config.id}
                    config={config}
                    couponsCount={data.couponsCount[config.id] || 0}
                    onEdit={() => openCashback(config.id)}
                    onDelete={() => confirmDeleteCashback(config.id)}
                  />
                ))}
                <AutomationCreateCard
                  icon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Plus className="h-5 w-5" /></div>}
                  subtitle="Configure um novo cashback"
                  onClick={() => openCashback()}
                />
              </>
            )}
          </div>
        </AutomationMainCard>

        {/* Order Notification */}
        <AutomationMainCard
          icon={<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info/10 text-info"><Bell className="h-6 w-6" /></div>}
          title="Notificação de Pedido"
          description="Atualize clientes sobre status de pedidos"
          activeCount={data.orderNotificationConfigs.filter(c => c.is_active).length}
          tokensPerExec={1}
          lastExecution={data.orderNotificationStats.lastExecution}
          totalExecutions={data.orderNotificationStats.total}
          expanded={orderNotificationExpanded}
          onToggle={() => setOrderNotificationExpanded(!orderNotificationExpanded)}
          onCreate={() => openOrderNotification()}
          accentClass="border-info/50"
        >
          <div className="ml-8 space-y-2 border-l-2 border-info/20 pl-4">
            {data.orderNotificationConfigs.map(config => (
              <AutomationSubCard
                key={config.id}
                icon={<Bell className="h-5 w-5" />}
                activeIcon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><Bell className="h-5 w-5" /></div>}
                title={config.name}
                subtitle={`${config.rules_count || 0} regra${(config.rules_count || 0) !== 1 ? 's' : ''} configurada${(config.rules_count || 0) !== 1 ? 's' : ''}`}
                isActive={config.is_active}
                onClick={() => openOrderNotification(config.id)}
              />
            ))}
            <AutomationCreateCard
              icon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><Plus className="h-5 w-5" /></div>}
              subtitle="Configure notificações de status"
              onClick={() => openOrderNotification()}
            />
          </div>
        </AutomationMainCard>

        {/* Birthday */}
        <AutomationMainCard
          icon={<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-instagram/10 text-instagram"><Cake className="h-6 w-6" /></div>}
          title="Aniversariantes"
          description="Cupons de desconto para aniversariantes"
          activeCount={data.birthdayConfigs.filter(c => c.is_active).length}
          tokensPerExec={3}
          lastExecution={data.birthdayStats.lastExecution}
          totalExecutions={data.birthdayStats.total}
          expanded={birthdayExpanded}
          onToggle={() => setBirthdayExpanded(!birthdayExpanded)}
          onCreate={() => openBirthday()}
          accentClass="border-instagram/50"
        >
          <div className="ml-8 space-y-2 border-l-2 border-instagram/20 pl-4">
            {data.birthdayConfigs.map(config => (
              <AutomationSubCard
                key={config.id}
                icon={<Cake className="h-5 w-5" />}
                activeIcon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-instagram/10 text-instagram"><Cake className="h-5 w-5" /></div>}
                title={config.name}
                subtitle={`${config.coupon_discount_percent}% • ${config.coupon_duration_days} dias`}
                isActive={config.is_active}
                onClick={() => openBirthday(config.id)}
              />
            ))}
            <AutomationCreateCard
              icon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-instagram/10 text-instagram"><Plus className="h-5 w-5" /></div>}
              subtitle="Configure aniversariantes"
              onClick={() => openBirthday()}
              borderAccentClass="hover:border-instagram/30"
            />
          </div>
        </AutomationMainCard>

        {/* Reactivation */}
        <AutomationMainCard
          icon={<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400"><Repeat className="h-6 w-6" /></div>}
          title="Reativação de Clientes"
          description="Reengaje clientes inativos com cupons personalizados"
          activeCount={data.reactivationConfigs.filter(c => c.is_active).length}
          tokensPerExec={5}
          lastExecution={data.reactivationStats.lastExecution}
          totalExecutions={data.reactivationStats.total}
          expanded={reactivationExpanded}
          onToggle={() => setReactivationExpanded(!reactivationExpanded)}
          onCreate={() => openReactivation()}
          accentClass="border-violet-500/50"
        >
          <div className="ml-8 space-y-2 border-l-2 border-violet-500/20 pl-4">
            {data.reactivationConfigs.map(config => (
              <AutomationSubCard
                key={config.id}
                icon={<Repeat className="h-5 w-5" />}
                activeIcon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><Repeat className="h-5 w-5" /></div>}
                title={config.name}
                subtitle={`${config.inactivity_days} dias inatividade • ${config.coupon_discount_percent}%`}
                isActive={config.is_active}
                onClick={() => openReactivation(config.id)}
              />
            ))}
            <AutomationCreateCard
              icon={<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><Plus className="h-5 w-5" /></div>}
              subtitle="Configure reativação de clientes"
              onClick={() => openReactivation()}
              borderAccentClass="hover:border-violet-500/30"
            />
          </div>
        </AutomationMainCard>
      </div>

      {/* Dialogs */}
      <CashbackConfigDialog
        open={cashbackDialogOpen}
        onOpenChange={() => { setCashbackDialogOpen(false); setEditingCashbackId(null); }}
        editingId={editingCashbackId}
        onSave={data.loadCashbackData}
      />
      <OrderNotificationConfigDialog
        open={orderNotificationDialogOpen}
        onOpenChange={(open) => { setOrderNotificationDialogOpen(open); if (!open) setEditingOrderNotificationId(null); }}
        editingId={editingOrderNotificationId}
        onSave={data.loadOrderNotificationData}
      />
      <BirthdayConfigDialog
        open={birthdayDialogOpen}
        onOpenChange={(open) => { setBirthdayDialogOpen(open); if (!open) setEditingBirthdayId(null); }}
        editingId={editingBirthdayId}
        onSave={data.loadBirthdayData}
      />
      <ReactivationConfigDialog
        open={reactivationDialogOpen}
        onOpenChange={(open) => { setReactivationDialogOpen(open); if (!open) setEditingReactivationId(null); }}
        editingId={editingReactivationId}
        onSave={data.loadReactivationData}
      />
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Cashback</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta configuração de cashback? Esta ação não pode ser desfeita e todos os cupons gerados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCashback} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AutomationsPage;
