import { useState, useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { Bell, Package, Store, Save, Loader2, AlertCircle, MessageSquare, Plus, Mail, Code, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import { createLogger } from '@/lib/logger';
const log = createLogger('OrderNotificationConfigDialog');

type DelayUnit = 'minutes' | 'hours' | 'days' | 'months';

const DELAY_UNIT_LABELS: Record<DelayUnit, string> = {
  minutes: 'Minutos',
  hours: 'Horas',
  days: 'Dias',
  months: 'Meses',
};

function minutesToDelayConfig(totalMinutes: number): { value: number; unit: DelayUnit } {
  if (totalMinutes <= 0) return { value: 0, unit: 'minutes' };
  if (totalMinutes % (30 * 24 * 60) === 0) return { value: totalMinutes / (30 * 24 * 60), unit: 'months' };
  if (totalMinutes % (24 * 60) === 0) return { value: totalMinutes / (24 * 60), unit: 'days' };
  if (totalMinutes % 60 === 0) return { value: totalMinutes / 60, unit: 'hours' };
  return { value: totalMinutes, unit: 'minutes' };
}

function delayConfigToMinutes(value: number, unit: DelayUnit): number {
  switch (unit) {
    case 'months': return value * 30 * 24 * 60;
    case 'days': return value * 24 * 60;
    case 'hours': return value * 60;
    default: return value;
  }
}

interface StatusRule {
  id?: string;
  status_name: string;
  status_id?: number;
  is_enabled: boolean;
  message_template: string;
  email_subject?: string;
  email_body?: string;
  delay_minutes: number;
  delay_value?: number;
  delay_unit?: DelayUnit;
}

interface OrderNotificationConfig {
  id?: string;
  name: string;
  integration_id: string | null;
  whatsapp_integration_id: string | null;
  email_integration_id: string | null;
  send_via_whatsapp: boolean;
  send_via_email: boolean;
  is_active: boolean;
  status_rules: StatusRule[];
}

interface OrderNotificationConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId?: string | null;
  onSave: () => void;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface EmailIntegration {
  id: string;
  name: string;
  sender_email: string;
  is_active: boolean;
}

// Placeholders disponíveis para a mensagem
const MESSAGE_PLACEHOLDERS = [
  { key: '{{cliente_nome}}', label: 'Nome Completo', description: 'Nome completo do cliente' },
  { key: '{{cliente_primeiro_nome}}', label: 'Primeiro Nome', description: 'Apenas o primeiro nome do cliente' },
  { key: '{{numero_pedido}}', label: 'Número do Pedido', description: 'Número do pedido' },
  { key: '{{status}}', label: 'Status', description: 'Nome do status atual' },
  { key: '{{valor_total}}', label: 'Valor Total', description: 'Valor total do pedido' },
  { key: '{{produtos}}', label: 'Produtos', description: 'Lista de produtos do pedido' },
  { key: '{{rastreamento}}', label: 'Código Rastreamento', description: 'Código de rastreio (se disponível)' },
];

// Default message templates per status
const DEFAULT_MESSAGES: Record<string, string> = {
  'Pedido Pago': 'Olá {{cliente_primeiro_nome}}! 🎉 Seu pedido #{{numero_pedido}} foi confirmado! Valor: {{valor_total}}. Já estamos preparando para envio.',
  'Pedido Enviado': 'Oi {{cliente_primeiro_nome}}! 📦 Seu pedido #{{numero_pedido}} saiu para entrega! {{rastreamento}}',
  'Pedido Entregue': '{{cliente_primeiro_nome}}, seu pedido #{{numero_pedido}} foi entregue! 🏠 Esperamos que goste. Qualquer dúvida, estamos aqui!',
  'Pedido Cancelado': 'Olá {{cliente_primeiro_nome}}, seu pedido #{{numero_pedido}} foi cancelado. Se tiver dúvidas, entre em contato.',
};

const STORE_TYPES = ['loja_integrada', 'nuvem_shop', 'shopify', 'woocommerce', 'bling'];
const WHATSAPP_TYPES = ['evolution_whatsapp', 'whatsapp_api', 'z_api'];

const getStoreIntegrationIcon = (type: string): string => {
  switch (type) {
    case 'loja_integrada': return '🛒';
    case 'nuvem_shop': return '☁️';
    case 'shopify': return '🛍️';
    case 'woocommerce': return '🔮';
    case 'bling': return '📊';
    default: return '🏪';
  }
};

const getWhatsAppIntegrationIcon = (type: string): string => {
  switch (type) {
    case 'evolution_whatsapp': return '📱';
    case 'whatsapp_api': return '💬';
    case 'z_api': return '🔌';
    default: return '📲';
  }
};

const defaultConfig: OrderNotificationConfig = {
  name: "",
  integration_id: null,
  whatsapp_integration_id: null,
  email_integration_id: null,
  send_via_whatsapp: true,
  send_via_email: false,
  is_active: true,
  status_rules: [],
};

export function OrderNotificationConfigDialog({
  open,
  onOpenChange,
  editingId,
  onSave,
}: OrderNotificationConfigDialogProps) {
  const [config, setConfig] = useState<OrderNotificationConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [storeIntegrations, setStoreIntegrations] = useState<Integration[]>([]);
  const [whatsappIntegrations, setWhatsappIntegrations] = useState<Integration[]>([]);
  const [emailIntegrations, setEmailIntegrations] = useState<EmailIntegration[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { tenant } = useAuth();

  // Reset and load data when dialog opens
  useEffect(() => {
    if (open) {
      loadIntegrations();
      loadEmailIntegrations();
      if (editingId) {
        loadExistingConfig(editingId);
      } else {
        setConfig(defaultConfig);
        setSelectedRuleIndex(null);
      }
    }
  }, [open, editingId]);

  // Load statuses when store integration changes
  useEffect(() => {
    if (config.integration_id) {
      loadAvailableStatuses(config.integration_id);
    }
  }, [config.integration_id]);

  const loadExistingConfig = async (id: string) => {
    setIsLoading(true);
    try {
      const { data: configData, error: configError } = await supabase
        .from('order_notification_configs')
        .select('id, name, integration_id, whatsapp_integration_id, email_integration_id, send_via_whatsapp, send_via_email, is_active')
        .eq('id', id)
        .single();

      if (configError) throw configError;

      const { data: rulesData, error: rulesError } = await supabase
        .from('order_notification_status_rules')
        .select('id, config_id, status_name, message_template, email_subject, email_body, is_enabled, delay_minutes')
        .eq('config_id', id)
        .order('status_name');

      if (rulesError) throw rulesError;

      setConfig({
        id: configData.id,
        name: configData.name,
        integration_id: configData.integration_id,
        whatsapp_integration_id: configData.whatsapp_integration_id,
        email_integration_id: configData.email_integration_id,
        send_via_whatsapp: configData.send_via_whatsapp ?? true,
        send_via_email: configData.send_via_email ?? false,
        is_active: configData.is_active ?? true,
        status_rules: (rulesData || []).map(r => {
          const parsed = minutesToDelayConfig(r.delay_minutes || 0);
          return { ...r, delay_value: parsed.value, delay_unit: parsed.unit };
        }),
      });
    } catch (error) {
      log.error('Error loading config:', error);
      toast({
        title: "Erro ao carregar",
        description: "Não foi possível carregar a configuração.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('status', 'connected');

      if (data && !error) {
        setStoreIntegrations(data.filter(i => STORE_TYPES.includes(i.type)));
        setWhatsappIntegrations(data.filter(i => WHATSAPP_TYPES.includes(i.type)));
      }
    } catch (error) {
      log.error('Error loading integrations:', error);
    }
  };

  const loadEmailIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('email_integrations')
        .select('id, name, sender_email, is_active')
        .eq('is_active', true);

      if (data && !error) {
        setEmailIntegrations(data);
      }
    } catch (error) {
      log.error('Error loading email integrations:', error);
    }
  };

  const loadAvailableStatuses = async (integrationId: string) => {
    setIsLoadingStatuses(true);
    try {
      // Call edge function to get statuses (bypasses RLS and uses proper logic per platform)
      const { data, error } = await supabase.functions.invoke('get-store-statuses', {
        body: { integration_id: integrationId }
      });

      if (error) {
        log.error('Error fetching statuses:', error);
        return;
      }

      if (data?.success && data.statuses) {
        const statuses = data.statuses.map((s: { id: number | null; name: string }) => s.name);
        setAvailableStatuses(statuses);

        // Auto-add rules for new statuses (only when creating new config)
        if (!editingId && statuses.length > 0) {
          const newRules: StatusRule[] = statuses.map((status: string) => ({
            status_name: status,
            status_id: data.statuses.find((s: { name: string }) => s.name === status)?.id,
            is_enabled: false,
            message_template: DEFAULT_MESSAGES[status] || 
              `Olá {{cliente_primeiro_nome}}! Seu pedido #{{numero_pedido}} está com status: ${status}.`,
            delay_minutes: 0,
          }));
          setConfig(prev => ({ ...prev, status_rules: newRules }));
        }
      }
    } catch (error) {
      log.error('Error loading statuses:', error);
    } finally {
      setIsLoadingStatuses(false);
    }
  };

  const toggleStatusRule = (statusName: string) => {
    setConfig(prev => {
      const existingIndex = prev.status_rules.findIndex(r => r.status_name === statusName);
      
      if (existingIndex >= 0) {
        const newRules = [...prev.status_rules];
        newRules[existingIndex] = {
          ...newRules[existingIndex],
          is_enabled: !newRules[existingIndex].is_enabled
        };
        return { ...prev, status_rules: newRules };
      } else {
        // Add new rule
        return {
          ...prev,
          status_rules: [
            ...prev.status_rules,
            {
              status_name: statusName,
              is_enabled: true,
              message_template: DEFAULT_MESSAGES[statusName] || `Olá {{cliente_primeiro_nome}}! Seu pedido #{{numero_pedido}} está com status: ${statusName}.`,
              delay_minutes: 0,
            }
          ]
        };
      }
    });
  };

  const updateRuleMessage = (statusName: string, message: string) => {
    setConfig(prev => ({
      ...prev,
      status_rules: prev.status_rules.map(r =>
        r.status_name === statusName ? { ...r, message_template: message } : r
      )
    }));
  };

  const updateRuleDelay = (statusName: string, delay: number) => {
    setConfig(prev => ({
      ...prev,
      status_rules: prev.status_rules.map(r =>
        r.status_name === statusName ? { ...r, delay_minutes: delay } : r
      )
    }));
  };

  const insertPlaceholder = (placeholder: string, statusName: string) => {
    const rule = config.status_rules.find(r => r.status_name === statusName);
    if (!rule) return;
    
    const newMessage = rule.message_template + placeholder;
    updateRuleMessage(statusName, newMessage);
  };

  const handleSave = async () => {
    if (!config.integration_id) {
      toast({
        title: "Erro de validação",
        description: "Selecione uma integração de loja",
        variant: "destructive",
      });
      return;
    }

    const enabledRules = config.status_rules.filter(r => r.is_enabled);
    if (enabledRules.length === 0) {
      toast({
        title: "Erro de validação",
        description: "Ative pelo menos um status para notificação",
        variant: "destructive",
      });
      return;
    }

    if (config.send_via_whatsapp && !config.whatsapp_integration_id) {
      toast({
        title: "Erro de validação",
        description: "Selecione uma integração WhatsApp para envio",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    try {
      const configData = {
        name: config.name || 'Notificação de Pedido',
        integration_id: config.integration_id,
        whatsapp_integration_id: config.whatsapp_integration_id,
        email_integration_id: config.email_integration_id,
        send_via_whatsapp: config.send_via_whatsapp,
        send_via_email: config.send_via_email,
        is_active: config.is_active,
        updated_at: new Date().toISOString(),
      };

      let configId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from('order_notification_configs')
          .update(configData)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('order_notification_configs')
          .insert({ ...configData, tenant_id: tenant?.id })
          .select()
          .single();

        if (error) throw error;
        configId = data.id;
      }

      // Delete existing rules and insert new ones
      if (configId) {
        await supabase
          .from('order_notification_status_rules')
          .delete()
          .eq('config_id', configId);

        const rulesData = config.status_rules
          .filter(r => r.is_enabled)
          .map(r => ({
            config_id: configId,
            tenant_id: tenant?.id,
            status_name: r.status_name,
            status_id: r.status_id || null,
            is_enabled: r.is_enabled,
            message_template: r.message_template,
            email_subject: r.email_subject || null,
            email_body: r.email_body || null,
            delay_minutes: r.delay_minutes || 0,
          }));

        if (rulesData.length > 0) {
          const { error: rulesError } = await supabase
            .from('order_notification_status_rules')
            .insert(rulesData);

          if (rulesError) throw rulesError;
        }
      }

      onSave();
      toast({
        title: "Configuração salva",
        description: editingId
          ? "A notificação de pedido foi atualizada."
          : "Nova notificação de pedido criada.",
      });
      onOpenChange(false);
    } catch (error) {
      log.error('Error saving config:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedRule = selectedRuleIndex !== null ? config.status_rules[selectedRuleIndex] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <Bell className="h-5 w-5" />
            </div>
            {editingId ? "Editar Notificação de Pedido" : "Nova Notificação de Pedido"}
          </DialogTitle>
          <DialogDescription>
            Configure notificações automáticas quando pedidos mudarem de status.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                Nome da Automação
              </Label>
              <Input
                placeholder="Ex: Notificações Loja Integrada"
                value={config.name}
                onChange={(e) => setConfig({ ...config, name: e.target.value })}
              />
            </div>

            {/* Status Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">Automação ativa</span>
              <Switch
                checked={config.is_active}
                onCheckedChange={(checked) => setConfig({ ...config, is_active: checked })}
              />
            </div>

            {/* Store Integration */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Store className="h-4 w-4 text-muted-foreground" />
                Integração da Loja
              </Label>
              {storeIntegrations.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-destructive">
                    Nenhuma loja conectada. Configure uma integração primeiro.
                  </span>
                </div>
              ) : (
                <Select
                  value={config.integration_id || ""}
                  onValueChange={(value) => setConfig({ ...config, integration_id: value })}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecione a loja" />
                  </SelectTrigger>
                  <SelectContent>
                    {storeIntegrations.map((integration) => (
                      <SelectItem key={integration.id} value={integration.id}>
                        <span className="flex items-center gap-2">
                          <span>{getStoreIntegrationIcon(integration.type)}</span>
                          <span>{integration.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Status Rules */}
            {config.integration_id && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Status para Notificação
                </Label>
                
                {isLoadingStatuses ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Carregando status...</span>
                  </div>
                ) : availableStatuses.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="text-sm text-yellow-600">
                      Nenhum status encontrado. Sincronize alguns pedidos primeiro.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {availableStatuses.map((status) => {
                      const rule = config.status_rules.find(r => r.status_name === status);
                      const isEnabled = rule?.is_enabled ?? false;

                      return (
                        <div
                          key={status}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all",
                            isEnabled 
                              ? "border-primary/50 bg-primary/5" 
                              : "border-border hover:border-primary/30"
                          )}
                          onClick={() => toggleStatusRule(status)}
                        >
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-3 h-3 rounded-full",
                              isEnabled ? "bg-primary" : "bg-muted-foreground/30"
                            )} />
                            <span className="text-sm font-medium">{status}</span>
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={() => toggleStatusRule(status)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Message Configuration for enabled statuses */}
            {config.status_rules.filter(r => r.is_enabled).length > 0 && (
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Mensagens por Status
                </Label>
                
                <Tabs defaultValue={config.status_rules.find(r => r.is_enabled)?.status_name} className="w-full">
                  <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
                    {config.status_rules.filter(r => r.is_enabled).map((rule) => (
                      <TabsTrigger
                        key={rule.status_name}
                        value={rule.status_name}
                        className="text-xs px-2 py-1"
                      >
                        {rule.status_name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  
                  {config.status_rules.filter(r => r.is_enabled).map((rule) => (
                    <TabsContent key={rule.status_name} value={rule.status_name} className="space-y-3">
                      {/* Placeholders */}
                      <div className="flex flex-wrap gap-1">
                        {MESSAGE_PLACEHOLDERS.map((placeholder) => (
                          <Badge
                            key={placeholder.key}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/10 text-xs"
                            onClick={() => insertPlaceholder(placeholder.key, rule.status_name)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            {placeholder.label}
                          </Badge>
                        ))}
                      </div>
                      
                      {/* Message Template */}
                      <Textarea
                        value={rule.message_template}
                        onChange={(e) => updateRuleMessage(rule.status_name, e.target.value)}
                        placeholder="Digite a mensagem para este status..."
                        className="min-h-[100px]"
                      />
                      
                      {/* Delay */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Label className="text-sm whitespace-nowrap">Atraso:</Label>
                        <Input
                          type="number"
                          min={0}
                          value={rule.delay_value ?? 0}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const unit = rule.delay_unit || 'minutes';
                            const totalMinutes = delayConfigToMinutes(val, unit);
                            setConfig(prev => ({
                              ...prev,
                              status_rules: prev.status_rules.map(r =>
                                r.status_name === rule.status_name
                                  ? { ...r, delay_value: val, delay_unit: unit, delay_minutes: totalMinutes }
                                  : r
                              )
                            }));
                          }}
                          className="w-20"
                        />
                        <Select
                          value={rule.delay_unit || 'minutes'}
                          onValueChange={(unit: DelayUnit) => {
                            const val = rule.delay_value ?? 0;
                            const totalMinutes = delayConfigToMinutes(val, unit);
                            setConfig(prev => ({
                              ...prev,
                              status_rules: prev.status_rules.map(r =>
                                r.status_name === rule.status_name
                                  ? { ...r, delay_unit: unit, delay_minutes: totalMinutes }
                                  : r
                              )
                            }));
                          }}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(DELAY_UNIT_LABELS) as DelayUnit[]).map(u => (
                              <SelectItem key={u} value={u}>{DELAY_UNIT_LABELS[u]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          {(rule.delay_value ?? 0) === 0 && (rule.delay_unit || 'minutes') === 'minutes'
                            ? '0 = envio imediato'
                            : ''}
                        </span>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>
            )}

            {/* Sending Channels */}
            <div className="space-y-4">
              <Label>Canais de Envio</Label>
              
              {/* WhatsApp */}
              <div className="space-y-2 p-3 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📱</span>
                    <span className="font-medium">WhatsApp</span>
                  </div>
                  <Switch
                    checked={config.send_via_whatsapp}
                    onCheckedChange={(checked) => setConfig({ ...config, send_via_whatsapp: checked })}
                  />
                </div>
                
                {config.send_via_whatsapp && (
                  <Select
                    value={config.whatsapp_integration_id || ""}
                    onValueChange={(value) => setConfig({ ...config, whatsapp_integration_id: value })}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Selecione o WhatsApp" />
                    </SelectTrigger>
                    <SelectContent>
                      {whatsappIntegrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          <span className="flex items-center gap-2">
                            <span>{getWhatsAppIntegrationIcon(integration.type)}</span>
                            <span>{integration.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              
              {/* Email */}
              <div className="space-y-2 p-3 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    <span className="font-medium">E-mail</span>
                  </div>
                  <Switch
                    checked={config.send_via_email}
                    onCheckedChange={(checked) => setConfig({ ...config, send_via_email: checked })}
                  />
                </div>
                
                {config.send_via_email && (
                  <Select
                    value={config.email_integration_id || ""}
                    onValueChange={(value) => setConfig({ ...config, email_integration_id: value })}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Selecione a integração de e-mail" />
                    </SelectTrigger>
                    <SelectContent>
                      {emailIntegrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          <span className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span>{integration.name}</span>
                            <span className="text-xs text-muted-foreground">({integration.sender_email})</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
