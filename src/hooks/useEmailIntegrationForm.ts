import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";

const log = createLogger("useEmailIntegrationForm");

export interface EmailIntegration {
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

export interface SenderRow {
  id?: string;
  sender_email: string;
  sender_name: string;
  is_active: boolean;
  isNew?: boolean;
}

const EMPTY_FORM = {
  name: "", sender_name: "", sender_email: "",
  smtp_host: "", smtp_port: "587", smtp_user: "", smtp_password: "",
  smtp_secure: false, smtp_tls: true,
  reply_to: "", daily_send_limit: "", max_sends_per_second: "",
};

interface Options {
  integration?: EmailIntegration | null;
  open: boolean;
  onSuccess: () => void;
  onOpenChange: (open: boolean) => void;
}

export function useEmailIntegrationForm({ integration, open, onSuccess, onOpenChange }: Options) {
  const [isLoading, setIsLoading] = useState(false);
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [loadingSenders, setLoadingSenders] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);

  useEffect(() => {
    if (integration) {
      setFormData({
        name: integration.name,
        sender_name: integration.sender_name || "",
        sender_email: integration.sender_email,
        smtp_host: integration.smtp_host,
        smtp_port: integration.smtp_port.toString(),
        smtp_user: integration.smtp_user,
        smtp_password: "",
        smtp_secure: integration.smtp_secure ?? false,
        smtp_tls: integration.smtp_tls ?? true,
        reply_to: integration.reply_to || "",
        daily_send_limit: integration.daily_send_limit?.toString() || "",
        max_sends_per_second: integration.max_sends_per_second?.toString() || "",
      });
      loadSenders(integration.id);
    } else {
      setFormData(EMPTY_FORM);
      setSenders([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const updateField = <K extends keyof typeof formData>(field: K, value: typeof formData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePortChange = (port: string) => {
    if (port === "465") {
      setFormData(prev => ({ ...prev, smtp_port: port, smtp_secure: true, smtp_tls: false }));
    } else {
      setFormData(prev => ({ ...prev, smtp_port: port, smtp_secure: false, smtp_tls: true }));
    }
  };

  const handleSecureChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, smtp_secure: checked, smtp_tls: checked ? false : prev.smtp_tls }));
  };

  const handleTlsChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, smtp_tls: checked, smtp_secure: checked ? false : prev.smtp_secure }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
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
      if (formData.smtp_password.trim()) payload.smtp_password = formData.smtp_password;

      const { data, error } = await supabase.functions.invoke("manage-smtp", { body: payload });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao salvar");

      const integrationId = data.id || integration?.id;
      if (integrationId && senders.length > 0) {
        await supabase.functions.invoke("manage-smtp", {
          body: { action: "save-senders", integration_id: integrationId, senders },
        });
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

  return {
    isLoading, formData, updateField, handlePortChange, handleSecureChange, handleTlsChange,
    senders, loadingSenders, addSender, removeSender, updateSender, activeSendersCount,
    handleSubmit,
  };
}
