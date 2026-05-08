import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Mail, Loader2, Eye, EyeOff, Info, Plus, Trash2, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { createLogger } from '@/lib/logger';
const log = createLogger('EmailIntegrationDialog');

interface EmailIntegration {
  id: string;
  name: string;
  sender_email: string;
  sender_name?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  has_password: boolean;
  smtp_secure: boolean;
  smtp_tls: boolean;
  reply_to: string | null;
  is_active: boolean;
  daily_send_limit?: number | null;
  max_sends_per_second?: number | null;
}

interface SenderRow {
  id?: string;
  sender_email: string;
  sender_name: string;
  is_active: boolean;
  isNew?: boolean;
}

interface EmailIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration?: EmailIntegration | null;
  onSuccess: () => void;
}

export function EmailIntegrationDialog({
  open,
  onOpenChange,
  integration,
  onSuccess,
}: EmailIntegrationDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    sender_name: "",
    sender_email: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_password: "",
    smtp_secure: false,
    smtp_tls: true,
    reply_to: "",
    daily_send_limit: "",
    max_sends_per_second: "",
  });

  useEffect(() => {
    if (integration) {
      setFormData({
        name: integration.name,
        sender_name: integration.sender_name || "",
        sender_email: integration.sender_email,
        smtp_host: integration.smtp_host,
        smtp_port: integration.smtp_port.toString(),
        smtp_user: integration.smtp_user,
        smtp_password: "", // Never loaded from server — user must re-enter to change
        smtp_secure: integration.smtp_secure ?? false,
        smtp_tls: integration.smtp_tls ?? true,
        reply_to: integration.reply_to || "",
        daily_send_limit: integration.daily_send_limit?.toString() || "",
        max_sends_per_second: integration.max_sends_per_second?.toString() || "",
      });
      loadSenders(integration.id);
    } else {
      setFormData({
        name: "",
        sender_name: "",
        sender_email: "",
        smtp_host: "",
        smtp_port: "587",
        smtp_user: "",
        smtp_password: "",
        smtp_secure: false,
        smtp_tls: true,
        reply_to: "",
        daily_send_limit: "",
        max_sends_per_second: "",
      });
      setSenders([]);
    }
  }, [integration, open]);

  const loadSenders = async (integrationId: string) => {
    setLoadingSenders(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-smtp", {
        body: { action: "list-senders", integration_id: integrationId },
      });
      if (!error && data?.data) {
        setSenders(data.data.map((s: { id: string; sender_email: string; sender_name?: string; is_active: boolean }) => ({
          id: s.id,
          sender_email: s.sender_email,
          sender_name: s.sender_name || "",
          is_active: s.is_active,
        })));
      }
    } catch {
      // ignore
    } finally {
      setLoadingSenders(false);
    }
  };

  const handlePortChange = (port: string) => {
    if (port === "465") {
      setFormData({ ...formData, smtp_port: port, smtp_secure: true, smtp_tls: false });
    } else {
      setFormData({ ...formData, smtp_port: port, smtp_secure: false, smtp_tls: true });
    }
  };

  const addSender = () => {
    setSenders([...senders, { sender_email: "", sender_name: "", is_active: true, isNew: true }]);
  };

  const removeSender = async (index: number) => {
    const sender = senders[index];
    if (sender.id) {
      await supabase.functions.invoke("manage-smtp", {
        body: { action: "delete-sender", sender_id: sender.id },
      });
    }
    setSenders(senders.filter((_, i) => i !== index));
  };

  const updateSender = (index: number, field: keyof SenderRow, value: any) => {
    const updated = [...senders];
    (updated[index] as any)[field] = value;
    setSenders(updated);
  };

  const saveSenders = async (integrationId: string) => {
    await supabase.functions.invoke("manage-smtp", {
      body: {
        action: "save-senders",
        integration_id: integrationId,
        senders,
      },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // For new integrations, password is required
      if (!integration && !formData.smtp_password.trim()) {
        throw new Error("Senha SMTP é obrigatória para nova integração");
      }

      const payload: Record<string, unknown> = {
        action: "upsert",
        id: integration?.id || undefined,
        name: formData.name,
        sender_name: formData.sender_name || null,
        sender_email: formData.sender_email,
        smtp_host: formData.smtp_host,
        smtp_port: parseInt(formData.smtp_port),
        smtp_user: formData.smtp_user,
        smtp_secure: formData.smtp_secure,
        smtp_tls: formData.smtp_tls,
        reply_to: formData.reply_to || null,
        daily_send_limit: formData.daily_send_limit ? parseInt(formData.daily_send_limit) : null,
        max_sends_per_second: formData.max_sends_per_second ? parseInt(formData.max_sends_per_second) : null,
      };

      // Only send password when user entered one (create or change)
      if (formData.smtp_password.trim()) {
        payload.smtp_password = formData.smtp_password;
      }

      const { data, error } = await supabase.functions.invoke("manage-smtp", {
        body: payload,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao salvar");

      const integrationId = data.id || integration?.id;

      if (integrationId && senders.length > 0) {
        await saveSenders(integrationId);
      }

      toast({ title: integration ? "Integração atualizada" : "Integração criada", description: "A configuração SMTP foi salva com sucesso." });
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      log.error("Error saving email integration:", error);
      toast({
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Não foi possível salvar a configuração.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const activeSendersCount = senders.filter(s => s.is_active && s.sender_email.trim()).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {integration ? "Editar" : "Nova"} Integração de E-mail
          </DialogTitle>
          <DialogDescription>
            Configure as credenciais SMTP para envio de e-mails.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome da Integração */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Integração</Label>
            <Input
              id="name"
              placeholder="Ex: E-mail Principal"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Remetente Principal */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sender_name">Nome do Remetente</Label>
              <Input
                id="sender_name"
                placeholder="Ex: Minha Loja"
                value={formData.sender_name}
                onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Nome que aparece no "De:" do e-mail.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender_email">E-mail do Remetente</Label>
              <Input
                id="sender_email"
                type="email"
                placeholder="contato@empresa.com"
                value={formData.sender_email}
                onChange={(e) => setFormData({ ...formData, sender_email: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reply_to">Responder Para (Reply-To)</Label>
              <Input
                id="reply_to"
                type="email"
                placeholder="respostas@empresa.com"
                value={formData.reply_to}
                onChange={(e) => setFormData({ ...formData, reply_to: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Opcional. Se vazio, usa o e-mail do remetente.</p>
            </div>
          </div>

          {/* SMTP Host + Port */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="smtp_host">Host SMTP</Label>
              <Input
                id="smtp_host"
                placeholder="Ex: smtp.gmail.com"
                value={formData.smtp_host}
                onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">Porta</Label>
              <Select value={formData.smtp_port} onValueChange={handlePortChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="465">465 (SSL)</SelectItem>
                  <SelectItem value="587">587 (TLS)</SelectItem>
                  <SelectItem value="2525">2525</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SSL / TLS toggles */}
          <div className="grid grid-cols-2 gap-4 p-3 rounded-md border bg-muted/30">
            <TooltipProvider>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="smtp_secure" className="text-sm cursor-pointer">SSL Direto</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="text-xs">Conexão SSL/TLS implícita desde o início. Usado normalmente na porta 465.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  id="smtp_secure"
                  checked={formData.smtp_secure}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, smtp_secure: checked, smtp_tls: checked ? false : formData.smtp_tls })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="smtp_tls" className="text-sm cursor-pointer">STARTTLS</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px]">
                      <p className="text-xs">Inicia sem criptografia e faz upgrade para TLS. Usado normalmente na porta 587.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Switch
                  id="smtp_tls"
                  checked={formData.smtp_tls}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, smtp_tls: checked, smtp_secure: checked ? false : formData.smtp_secure })
                  }
                />
              </div>
            </TooltipProvider>
          </div>

          {/* SMTP User */}
          <div className="space-y-2">
            <Label htmlFor="smtp_user">Usuário SMTP</Label>
            <Input
              id="smtp_user"
              placeholder="Normalmente o próprio e-mail"
              value={formData.smtp_user}
              onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
              required
            />
          </div>

          {/* SMTP Password */}
          <div className="space-y-2">
            <Label htmlFor="smtp_password">Senha ou Token SMTP</Label>
            <div className="relative">
              <Input
                id="smtp_password"
                type={showPassword ? "text" : "password"}
                placeholder={integration ? "Deixe vazio para manter a senha atual" : "Senha de aplicativo ou token"}
                value={formData.smtp_password}
                onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                required={!integration}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Para Gmail, use uma "Senha de App". Para Amazon SES, use as credenciais SMTP do IAM.
            </p>
          </div>

          {/* Limites de Envio */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Limites de Envio</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure os limites do seu provedor SMTP (ex: Amazon SES). Deixe em branco para não aplicar limite.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="daily_send_limit">Cota diária (emails/24h)</Label>
                <Input
                  id="daily_send_limit"
                  type="number"
                  min="0"
                  placeholder="Ex: 50000"
                  value={formData.daily_send_limit}
                  onChange={(e) => setFormData({ ...formData, daily_send_limit: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_sends_per_second">Emails por segundo</Label>
                <Input
                  id="max_sends_per_second"
                  type="number"
                  min="1"
                  placeholder="Ex: 14"
                  value={formData.max_sends_per_second}
                  onChange={(e) => setFormData({ ...formData, max_sends_per_second: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Remetentes Adicionais */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Remetentes para Rotação</Label>
                {activeSendersCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {activeSendersCount + 1} remetente{activeSendersCount > 0 ? "s" : ""} ativos
                  </Badge>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addSender}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Adicionar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cadastre múltiplos endereços de remetente para rotação automática em campanhas. 
              O remetente principal acima é sempre incluído.
            </p>

            {loadingSenders && <p className="text-xs text-muted-foreground">Carregando remetentes...</p>}

            {senders.map((sender, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Nome (ex: Promoções)"
                    value={sender.sender_name}
                    onChange={(e) => updateSender(idx, "sender_name", e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="email"
                    placeholder="email@empresa.com"
                    value={sender.sender_email}
                    onChange={(e) => updateSender(idx, "sender_email", e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <Switch
                  checked={sender.is_active}
                  onCheckedChange={(v) => updateSender(idx, "is_active", v)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => removeSender(idx)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {integration ? "Salvar Alterações" : "Criar Integração"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
