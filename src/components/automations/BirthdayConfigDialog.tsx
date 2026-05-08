import { useState, useEffect, useRef } from "react";
import { Cake, Percent, Clock, Store, Save, Loader2, MessageSquare, Plus } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

import { createLogger } from '@/lib/logger';
const log = createLogger('BirthdayConfigDialog');

interface BirthdayConfig {
  id?: string;
  name: string;
  integrationId: string | null;
  couponDiscountPercent: number;
  couponDurationDays: number;
  whatsappIntegrationId: string | null;
  isActive: boolean;
  messageTemplate: string;
}

interface BirthdayConfigDialogProps {
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

const STORE_TYPES = ['loja_integrada', 'bling'];
const WHATSAPP_TYPES = ['evolution_whatsapp', 'whatsapp_api', 'z_api'];

const MESSAGE_PLACEHOLDERS = [
  { key: '{{cliente_nome}}', label: 'Nome Completo' },
  { key: '{{cliente_primeiro_nome}}', label: 'Primeiro Nome' },
  { key: '{{desconto}}', label: '% Desconto' },
  { key: '{{cupom}}', label: 'Código Cupom' },
  { key: '{{validade}}', label: 'Dias Validade' },
];

const DEFAULT_MESSAGE = 'Olá {{cliente_nome}}! 🎂🎉 Feliz aniversário! Para comemorar, preparamos um cupom especial de {{desconto}}% de desconto para você! Use o código *{{cupom}}* e aproveite. Válido por {{validade}} dias!';

const defaultConfig: BirthdayConfig = {
  name: "Aniversariantes",
  integrationId: null,
  couponDiscountPercent: 10,
  couponDurationDays: 30,
  whatsappIntegrationId: null,
  isActive: true,
  messageTemplate: DEFAULT_MESSAGE,
};

const getStoreIcon = (type: string) => {
  switch (type) {
    case 'loja_integrada': return '🛒';
    case 'bling': return '📦';
    default: return '🏪';
  }
};

const getWhatsAppIcon = (type: string) => {
  switch (type) {
    case 'evolution_whatsapp': return '📱';
    case 'whatsapp_api': return '💬';
    default: return '📲';
  }
};

export function BirthdayConfigDialog({ open, onOpenChange, editingId, onSave }: BirthdayConfigDialogProps) {
  const [config, setConfig] = useState<BirthdayConfig>(defaultConfig);
  const [isSaving, setIsSaving] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { tenant } = useAuth();

  useEffect(() => {
    if (open) {
      loadIntegrations();
      if (editingId) {
        loadConfig(editingId);
      } else {
        setConfig(defaultConfig);
      }
    }
  }, [open, editingId]);

  const loadIntegrations = async () => {
    setIsLoadingIntegrations(true);
    try {
      const { data } = await supabase
        .from('integrations')
        .select('id, name, type, status')
        .eq('status', 'connected');
      if (data) setIntegrations(data);
    } catch (e) {
      log.error('Error loading integrations:', e);
    } finally {
      setIsLoadingIntegrations(false);
    }
  };

  const loadConfig = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('birthday_configs')
        .select('id, name, integration_id, coupon_discount_percent, coupon_duration_days, whatsapp_integration_id, is_active, message_template')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (data) {
        setConfig({
          id: data.id,
          name: data.name || 'Aniversariantes',
          integrationId: data.integration_id,
          couponDiscountPercent: Number(data.coupon_discount_percent),
          couponDurationDays: data.coupon_duration_days,
          whatsappIntegrationId: data.whatsapp_integration_id,
          isActive: data.is_active,
          messageTemplate: data.message_template || DEFAULT_MESSAGE,
        });
      }
    } catch (e) {
      log.error('Error loading config:', e);
      toast({ title: "Erro ao carregar", description: "Não foi possível carregar a configuração.", variant: "destructive" });
    }
  };

  const insertPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setConfig({ ...config, messageTemplate: config.messageTemplate + placeholder });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = config.messageTemplate.substring(0, start) + placeholder + config.messageTemplate.substring(end);
    setConfig({ ...config, messageTemplate: newText });
    setTimeout(() => {
      textarea.focus();
      const pos = start + placeholder.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleSave = async () => {
    if (!config.integrationId) {
      toast({ title: "Erro", description: "Selecione uma loja", variant: "destructive" });
      return;
    }
    if (!config.whatsappIntegrationId) {
      toast({ title: "Erro", description: "Selecione uma integração WhatsApp", variant: "destructive" });
      return;
    }
    if (config.couponDiscountPercent <= 0 || config.couponDiscountPercent > 100) {
      toast({ title: "Erro", description: "A porcentagem deve estar entre 1 e 100%", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const data = {
        name: config.name || 'Aniversariantes',
        integration_id: config.integrationId,
        coupon_discount_percent: config.couponDiscountPercent,
        coupon_duration_days: config.couponDurationDays,
        whatsapp_integration_id: config.whatsappIntegrationId,
        is_active: config.isActive,
        message_template: config.messageTemplate || DEFAULT_MESSAGE,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase.from('birthday_configs').update(data).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('birthday_configs').insert({ ...data, tenant_id: tenant?.id });
        if (error) throw error;
      }

      onSave();
      toast({ title: "Salvo!", description: editingId ? "Configuração atualizada." : "Automação de aniversário criada." });
      onOpenChange(false);
    } catch (e) {
      log.error('Error saving:', e);
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const storeIntegrations = integrations.filter(i => STORE_TYPES.includes(i.type));
  const whatsappIntegrations = integrations.filter(i => WHATSAPP_TYPES.includes(i.type));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cake className="h-5 w-5 text-pink-500" />
            {editingId ? 'Editar' : 'Nova'} Automação de Aniversário
          </DialogTitle>
          <DialogDescription>
            Envie mensagens de feliz aniversário com cupom de desconto automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nome da automação</Label>
            <Input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} placeholder="Aniversariantes" />
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Automação ativa</p>
              <p className="text-xs text-muted-foreground">Disparar mensagens automaticamente</p>
            </div>
            <Switch checked={config.isActive} onCheckedChange={(v) => setConfig({ ...config, isActive: v })} />
          </div>

          {/* Store */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Store className="h-4 w-4" /> Loja *</Label>
            {isLoadingIntegrations ? (
              <div className="flex items-center gap-2 p-2"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Carregando...</span></div>
            ) : (
              <Select value={config.integrationId || ''} onValueChange={(v) => setConfig({ ...config, integrationId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent>
                  {storeIntegrations.map(i => (
                    <SelectItem key={i.id} value={i.id}>{getStoreIcon(i.type)} {i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* WhatsApp */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><MessageSquare className="h-4 w-4" /> WhatsApp *</Label>
            <Select value={config.whatsappIntegrationId || ''} onValueChange={(v) => setConfig({ ...config, whatsappIntegrationId: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione o WhatsApp" /></SelectTrigger>
              <SelectContent>
                {whatsappIntegrations.map(i => (
                  <SelectItem key={i.id} value={i.id}>{getWhatsAppIcon(i.type)} {i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Coupon settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Percent className="h-4 w-4" /> Desconto (%)</Label>
              <Input type="number" min={1} max={100} value={config.couponDiscountPercent} onChange={(e) => setConfig({ ...config, couponDiscountPercent: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Validade (dias)</Label>
              <Input type="number" min={1} value={config.couponDurationDays} onChange={(e) => setConfig({ ...config, couponDurationDays: Number(e.target.value) })} />
            </div>
          </div>

          {/* Message template */}
          <div className="space-y-1.5">
            <Label>Mensagem WhatsApp</Label>
            <div className="flex flex-wrap gap-1 mb-1">
              {MESSAGE_PLACEHOLDERS.map(p => (
                <Badge key={p.key} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => insertPlaceholder(p.key)}>
                  <Plus className="h-3 w-3 mr-0.5" /> {p.label}
                </Badge>
              ))}
            </div>
            <Textarea
              ref={textareaRef}
              value={config.messageTemplate}
              onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })}
              rows={5}
              placeholder="Mensagem de aniversário..."
            />
          </div>

          {/* Token cost info */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
            <span className="text-muted-foreground">Custo por execução:</span>
            <span className="font-semibold text-primary">3 tokens</span>
          </div>

          {/* Save */}
          <Button className="w-full" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {editingId ? 'Atualizar' : 'Criar'} Automação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
