import { useState, useRef } from "react";
import {
  Send, Upload, Eye, Loader2, FileSpreadsheet, ImagePlus, X, Calendar, TrendingUp, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { supabase } from "@/integrations/supabase/client";
import { useAllRFMAudiences } from "@/hooks/useAllRFMAudiences";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { createLogger } from "@/lib/logger";
import type { WhatsAppIntegration, ContactRow } from "./types";

const logger = createLogger("CreateCampaignDialog");

const KNOWN_PHONE_KEYS = /^(telefone|phone|celular|whatsapp|número|numero)$/i;
const KNOWN_NAME_KEYS = /^(nome|name)$/i;

function buildPreview(template: string, contact: ContactRow | undefined): string {
  if (!contact) return template;
  let msg = template;
  msg = msg.replace(/{nome}/gi, contact.name || "");
  msg = msg.replace(/{primeiro_nome}/gi, (contact.name || "").split(/\s+/)[0] || "");
  for (const [key, val] of Object.entries(contact.variables)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, "gi"), val);
  }
  return msg;
}

const DEFAULT_SCHEDULE: Record<string, { enabled: boolean; start: string; end: string }> = {
  "1": { enabled: true, start: "09:00", end: "18:00" },
  "2": { enabled: true, start: "09:00", end: "18:00" },
  "3": { enabled: true, start: "09:00", end: "18:00" },
  "4": { enabled: true, start: "09:00", end: "18:00" },
  "5": { enabled: true, start: "09:00", end: "18:00" },
  "6": { enabled: true, start: "09:00", end: "16:00" },
  "0": { enabled: false, start: "09:00", end: "16:00" },
};

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrations: WhatsAppIntegration[];
  onCreated: () => void;
}

export function CreateCampaignDialog({ open, onOpenChange, integrations, onCreated }: CreateCampaignDialogProps) {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const { balance } = useTokens();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: rfmAudiences, isLoading: loadingRfmAudiences } = useAllRFMAudiences();

  const [campaignName, setCampaignName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState("");
  const [delayMin, setDelayMin] = useState("120");
  const [delayMax, setDelayMax] = useState("360");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [sendingScheduleEnabled, setSendingScheduleEnabled] = useState(false);
  const [sendingSchedule, setSendingSchedule] = useState({ ...DEFAULT_SCHEDULE });
  const [contactSource, setContactSource] = useState<"csv" | "rfm">("csv");
  const [selectedRfmAudienceId, setSelectedRfmAudienceId] = useState("");
  const [loadingRfmContacts, setLoadingRfmContacts] = useState(false);

  const availableVariables = [
    { key: "primeiro_nome", label: "Primeiro Nome", always: true },
    { key: "nome", label: "Nome Completo", always: true },
    ...extraColumns.map(col => ({ key: col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_"), label: col, always: false })),
  ];

  const insertVariable = (varKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessageTemplate(prev => prev + `{${varKey}}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = messageTemplate;
    const newText = text.substring(0, start) + `{${varKey}}` + text.substring(end);
    setMessageTemplate(newText);
    setTimeout(() => {
      textarea.focus();
      const pos = start + varKey.length + 2;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[,;\t]/).map(h => h.replace(/^"|"$/g, '').trim());
    return lines.slice(1).map(line => {
      const values = line.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, '').trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      return row;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const rawData = parseCSV(text);
        if (rawData.length === 0) { toast({ title: "Planilha vazia", variant: "destructive" }); return; }
        const keys = Object.keys(rawData[0]);
        const nameKey = keys.find(k => KNOWN_NAME_KEYS.test(k)) || keys[0];
        const phoneKey = keys.find(k => KNOWN_PHONE_KEYS.test(k)) || keys[1];
        const extras = keys.filter(k => k !== nameKey && k !== phoneKey);
        setExtraColumns(extras);
        const parsed: ContactRow[] = rawData.map((row) => {
          const name = String(row[nameKey] || "").trim();
          const phone = String(row[phoneKey] || "").replace(/\D/g, "").trim();
          const variables: Record<string, string> = { nome: name, primeiro_nome: name.split(/\s+/)[0] || "" };
          for (const col of extras) {
            const varKey = col.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
            variables[varKey] = String(row[col] || "").trim();
          }
          return { name, phone, variables };
        }).filter(c => c.phone.length >= 10);
        const seenPhones = new Set<string>();
        const deduplicated = parsed.filter(c => {
          const normalized = c.phone.replace(/^0+/, "");
          if (seenPhones.has(normalized)) return false;
          seenPhones.add(normalized);
          return true;
        });
        const duplicatesRemoved = parsed.length - deduplicated.length;
        setContacts(deduplicated);
        toast({ title: `${deduplicated.length} contatos carregados`, description: `Arquivo "${file.name}" processado.${duplicatesRemoved > 0 ? ` ${duplicatesRemoved} duplicatas removidas.` : ""}` });
      } catch {
        toast({ title: "Erro ao ler arquivo", description: "Verifique se o arquivo é um CSV válido.", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const loadRfmAudienceContacts = async (audienceId: string) => {
    if (!audienceId || !tenantId) return;
    setLoadingRfmContacts(true);
    try {
      const { data: members, error } = await supabase
        .from("rfm_audience_members")
        .select(`snapshot_id, customer_rfm_snapshots!inner ( customer_name, customer_phone, customer_email, customer_data, revenue_total )`)
        .eq("audience_id", audienceId)
        .eq("tenant_id", tenantId)
        .limit(5000);
      if (error) throw error;
      const parsed: ContactRow[] = [];
      const seenPhones = new Set<string>();
      for (const m of members || []) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snapshot = (m as any).customer_rfm_snapshots as any | null;
        if (!snapshot) continue;
        const customerData = (snapshot.customer_data || {}) as Record<string, string>;
        const name = (snapshot.customer_name as string) || customerData.name || "";
        const phone = ((snapshot.customer_phone as string) || customerData.phone || "").replace(/\D/g, "");
        const email = (snapshot.customer_email as string) || customerData.email || "";
        if (!phone || phone.length < 10) continue;
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);
        parsed.push({ name, phone, variables: { nome: name, primeiro_nome: name.split(/\s+/)[0] || "", email, total_compras: String(snapshot.revenue_total || 0) } });
      }
      setContacts(parsed);
      setExtraColumns(["email", "total_compras"]);
      toast({ title: `${parsed.length} contatos carregados da audiência RFM` });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro ao carregar contatos", description: message, variant: "destructive" });
    } finally {
      setLoadingRfmContacts(false);
    }
  };

  const removeMedia = () => {
    setMediaFile(null);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(null);
  };

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "Arquivo muito grande", description: "O limite é 10MB.", variant: "destructive" }); return; }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setCampaignName(""); setMessageTemplate(""); setSelectedIntegration(""); setDelayMin("120"); setDelayMax("360");
    setContacts([]); setFileName(""); setExtraColumns([]); removeMedia();
    setScheduledDate(""); setScheduledTime(""); setTimezone("America/Sao_Paulo");
    setSendingScheduleEnabled(false); setSendingSchedule({ ...DEFAULT_SCHEDULE });
    setContactSource("csv"); setSelectedRfmAudienceId("");
  };

  const handleCreate = async () => {
    if (!tenantId || !campaignName || !messageTemplate || !selectedIntegration || contacts.length === 0) {
      toast({ title: "Preencha todos os campos", description: "Nome, mensagem, WhatsApp e contatos são obrigatórios.", variant: "destructive" });
      return;
    }
    const tokensNeeded = contacts.length * 2;
    if (balance < tokensNeeded) {
      toast({ title: "Tokens insuficientes", description: `Necessário: ${tokensNeeded} tokens. Saldo: ${balance}.`, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType = "text";
      if (mediaFile) {
        setUploadingMedia(true);
        const ext = mediaFile.name.split(".").pop() || "bin";
        const filePath = `${tenantId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("campaign-media").upload(filePath, mediaFile, { upsert: true });
        setUploadingMedia(false);
        if (upErr) throw upErr;
        const { data: signedData, error: signErr } = await supabase.storage.from("campaign-media").createSignedUrl(filePath, 60 * 60 * 24 * 7);
        if (signErr) throw signErr;
        mediaUrl = signedData.signedUrl;
        mediaType = mediaFile.type.startsWith("image/") ? "image" : mediaFile.type.startsWith("video/") ? "video" : mediaFile.type.startsWith("audio/") ? "audio" : "document";
      }
      let scheduledAt: string | null = null;
      let initialStatus = "draft";
      if (scheduledDate && scheduledTime) {
        const dateTimeStr = `${scheduledDate}T${scheduledTime}:00`;
        const localDate = new Date(dateTimeStr);
        const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" });
        const parts = formatter.formatToParts(localDate);
        const offsetPart = parts.find(p => p.type === "timeZoneName")?.value || "";
        const match = offsetPart.match(/GMT([+-])(\d{2}):(\d{2})/);
        if (match) {
          const sign = match[1] === "+" ? 1 : -1;
          const hours = parseInt(match[2]);
          const minutes = parseInt(match[3]);
          const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;
          const localOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
          const utcDate = new Date(localDate.getTime() + localOffsetMs - offsetMs);
          scheduledAt = utcDate.toISOString();
        } else {
          scheduledAt = new Date(dateTimeStr).toISOString();
        }
        initialStatus = "scheduled";
      }
      let schedulePayload: Record<string, { start: string; end: string }> | null = null;
      if (sendingScheduleEnabled) {
        schedulePayload = {};
        for (const [day, config] of Object.entries(sendingSchedule)) {
          if (config.enabled) schedulePayload[day] = { start: config.start, end: config.end };
        }
      }
      const insertPayload = {
        tenant_id: tenantId, name: campaignName, message_template: messageTemplate,
        whatsapp_integration_id: selectedIntegration, delay_seconds: parseInt(delayMin) || 120,
        delay_max_seconds: parseInt(delayMax) || 360, total_contacts: contacts.length,
        tokens_per_message: 2, status: initialStatus, media_url: mediaUrl, media_type: mediaType,
        scheduled_at: scheduledAt, timezone, sending_schedule: schedulePayload,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: campaign, error: campError } = await supabase.from("bulk_campaigns").insert(insertPayload as any).select().single();
      if (campError) throw campError;
      const contactRows = contacts.map(c => ({ campaign_id: campaign.id, tenant_id: tenantId, name: c.name, phone: c.phone, variables: c.variables }));
      for (let i = 0; i < contactRows.length; i += 500) {
        const batch = contactRows.slice(i, i + 500);
        const { error: cErr } = await supabase.from("campaign_contacts").insert(batch);
        if (cErr) throw cErr;
      }
      toast({ title: "Campanha criada!", description: `${contacts.length} contatos adicionados.` });
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro desconhecido";
      logger.error("Error creating campaign", e);
      toast({ title: "Erro ao criar campanha", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewMessage = contacts.length > 0 ? buildPreview(messageTemplate, contacts[0]) : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Campanha de Disparo</DialogTitle>
          <DialogDescription>Configure e envie mensagens em massa via WhatsApp</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da campanha</Label>
            <Input placeholder="Ex: Promoção de Natal" value={campaignName} onChange={e => setCampaignName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>WhatsApp para envio</Label>
            <Select value={selectedIntegration} onValueChange={setSelectedIntegration}>
              <SelectTrigger><SelectValue placeholder="Selecione uma instância" /></SelectTrigger>
              <SelectContent>
                {integrations.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} {i.metadata?.instanceName ? `(${i.metadata.instanceName})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Intervalo entre mensagens (segundos)</Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="10" max="600" value={delayMin} onChange={e => setDelayMin(e.target.value)} className="w-24" />
              <span className="text-sm text-muted-foreground">a</span>
              <Input type="number" min="10" max="600" value={delayMax} onChange={e => setDelayMax(e.target.value)} className="w-24" />
              <span className="text-sm text-muted-foreground">seg</span>
            </div>
            <p className="text-xs text-muted-foreground">Delay aleatório entre cada envio para simular comportamento humano (recomendado: 120-360s)</p>
          </div>

          {/* Scheduling */}
          <div className="space-y-2">
            <Label>Agendamento (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className="w-40" />
              <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className="w-32" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Fuso horário:</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">Brasília (GMT-3)</SelectItem>
                  <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                  <SelectItem value="America/Cuiaba">Cuiabá (GMT-4)</SelectItem>
                  <SelectItem value="America/Belem">Belém (GMT-3)</SelectItem>
                  <SelectItem value="America/Fortaleza">Fortaleza (GMT-3)</SelectItem>
                  <SelectItem value="America/Recife">Recife (GMT-3)</SelectItem>
                  <SelectItem value="America/Bahia">Bahia (GMT-3)</SelectItem>
                  <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                  <SelectItem value="America/Noronha">Fernando de Noronha (GMT-2)</SelectItem>
                  <SelectItem value="America/Porto_Velho">Porto Velho (GMT-4)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {scheduledDate && scheduledTime ? "A campanha será iniciada automaticamente no horário agendado" : "Deixe vazio para iniciar manualmente"}
            </p>
          </div>

          {/* Sending Schedule */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Janela de horários de disparo
              </Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-muted-foreground">{sendingScheduleEnabled ? "Ativo" : "Inativo"}</span>
                <input type="checkbox" checked={sendingScheduleEnabled} onChange={e => setSendingScheduleEnabled(e.target.checked)} className="h-4 w-4 rounded border-input accent-primary" />
              </label>
            </div>
            {sendingScheduleEnabled && (
              <div className="space-y-2 p-3 border border-border/50 rounded-lg bg-muted/20">
                {[
                  { key: "1", label: "Segunda" }, { key: "2", label: "Terça" }, { key: "3", label: "Quarta" },
                  { key: "4", label: "Quinta" }, { key: "5", label: "Sexta" }, { key: "6", label: "Sábado" }, { key: "0", label: "Domingo" },
                ].map(day => {
                  const config = sendingSchedule[day.key];
                  return (
                    <div key={day.key} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 w-24 cursor-pointer">
                        <input type="checkbox" checked={config.enabled} onChange={e => setSendingSchedule(prev => ({ ...prev, [day.key]: { ...prev[day.key], enabled: e.target.checked } }))} className="h-4 w-4 rounded border-input accent-primary" />
                        <span className={cn("text-sm", config.enabled ? "text-foreground font-medium" : "text-muted-foreground line-through")}>{day.label}</span>
                      </label>
                      {config.enabled && (
                        <div className="flex items-center gap-1.5">
                          <Input type="time" value={config.start} onChange={e => setSendingSchedule(prev => ({ ...prev, [day.key]: { ...prev[day.key], start: e.target.value } }))} className="w-28 h-8 text-xs" />
                          <span className="text-xs text-muted-foreground">às</span>
                          <Input type="time" value={config.end} onChange={e => setSendingSchedule(prev => ({ ...prev, [day.key]: { ...prev[day.key], end: e.target.value } }))} className="w-28 h-8 text-xs" />
                        </div>
                      )}
                      {!config.enabled && <span className="text-xs text-muted-foreground italic">Sem disparos</span>}
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground mt-1">Os disparos serão pausados automaticamente fora dos horários configurados e retomados no próximo horário disponível.</p>
              </div>
            )}
          </div>

          {/* Contact Source */}
          <div className="space-y-3">
            <Label>Fonte de contatos</Label>
            <Tabs value={contactSource} onValueChange={(v) => { setContactSource(v as "csv" | "rfm"); setContacts([]); setFileName(""); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="csv" className="gap-2"><FileSpreadsheet className="h-4 w-4" />Planilha CSV</TabsTrigger>
                <TabsTrigger value="rfm" className="gap-2"><TrendingUp className="h-4 w-4" />Audiência RFM</TabsTrigger>
              </TabsList>
              <TabsContent value="csv" className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lista de contatos (CSV)</span>
                  <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs gap-1 text-primary" onClick={() => {
                    const csvContent = ["Nome,Telefone,Email,Cidade", "João Silva,11999998888,joao@email.com,São Paulo", "Maria Souza,21988887777,maria@email.com,Rio de Janeiro", "Pedro Santos,31977776666,pedro@email.com,Belo Horizonte"].join("\n");
                    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                    const u = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = u; a.download = "modelo-disparos.csv"; a.click(); URL.revokeObjectURL(u);
                  }}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />Baixar modelo
                  </Button>
                </div>
                <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center hover:border-primary/30 transition-colors">
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" id="excel-upload" />
                  <label htmlFor="excel-upload" className="cursor-pointer space-y-2 block">
                    <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium text-foreground">{fileName || "Clique para enviar planilha"}</p>
                    <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) ou CSV — colunas extras viram variáveis</p>
                  </label>
                </div>
              </TabsContent>
              <TabsContent value="rfm" className="mt-3 space-y-3">
                {loadingRfmAudiences ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" />Carregando audiências...</div>
                ) : !rfmAudiences || rfmAudiences.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhuma audiência RFM cadastrada.</p>
                    <p className="text-xs">Crie audiências na Matriz RFM.</p>
                  </div>
                ) : (
                  <>
                    <Select value={selectedRfmAudienceId} onValueChange={(v) => { setSelectedRfmAudienceId(v); if (v) loadRfmAudienceContacts(v); }}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma audiência RFM" /></SelectTrigger>
                      <SelectContent>
                        {rfmAudiences.map((aud) => (
                          <SelectItem key={aud.id} value={aud.id}>{aud.name} ({aud.member_count} membros) — {aud.integration_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {loadingRfmContacts && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando contatos...</div>}
                  </>
                )}
              </TabsContent>
            </Tabs>
            {contacts.length > 0 && (
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground font-medium">{contacts.length} contatos válidos encontrados</span>
                <span className="text-xs text-muted-foreground ml-auto">Custo: {contacts.length * 2} tokens</span>
              </div>
            )}
          </div>

          {/* Message + Variable Chips */}
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea ref={textareaRef} placeholder="Olá {primeiro_nome}, temos uma oferta especial para você!" rows={4} value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} />
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground mr-1 self-center">Variáveis:</span>
              {availableVariables.map(v => (
                <button key={v.key} type="button" onClick={() => insertVariable(v.key)} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer">
                  {`{${v.key}}`}
                </button>
              ))}
            </div>
            {messageTemplate && contacts.length > 0 && (
              <div className="p-3 bg-muted/40 rounded-lg border border-border/50 space-y-1">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Eye className="h-3 w-3" />Preview (1º contato):</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{previewMessage}</p>
              </div>
            )}
          </div>

          {/* Media Upload */}
          <div className="space-y-2">
            <Label>Mídia (opcional)</Label>
            {mediaPreview ? (
              <div className="relative inline-block">
                {mediaFile?.type.startsWith("image/") ? (
                  <img src={mediaPreview} alt="Preview" className="h-24 w-24 object-cover rounded-lg border border-border" />
                ) : mediaFile?.type.startsWith("video/") ? (
                  <video src={mediaPreview} className="h-24 w-24 object-cover rounded-lg border border-border" />
                ) : (
                  <div className="h-24 w-24 flex items-center justify-center rounded-lg border border-border bg-muted">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground mt-1">{mediaFile?.name.split('.').pop()}</span>
                  </div>
                )}
                <button type="button" onClick={removeMedia} className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center hover:border-primary/30 transition-colors">
                <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={handleMediaUpload} className="hidden" id="media-upload" />
                <label htmlFor="media-upload" className="cursor-pointer flex items-center justify-center gap-2">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Imagem, vídeo, áudio ou documento (máx. 10MB)</span>
                </label>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetForm(); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving || contacts.length === 0} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Criar Campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
