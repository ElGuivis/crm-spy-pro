import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useTokens } from "@/contexts/TokenContext";
import { createLogger } from "@/lib/logger";
import type { ContactRow } from "@/components/bulk-campaigns/types";

const logger = createLogger("useCreateCampaignForm");

export const DEFAULT_SCHEDULE: Record<string, { enabled: boolean; start: string; end: string }> = {
  "1": { enabled: true, start: "09:00", end: "18:00" },
  "2": { enabled: true, start: "09:00", end: "18:00" },
  "3": { enabled: true, start: "09:00", end: "18:00" },
  "4": { enabled: true, start: "09:00", end: "18:00" },
  "5": { enabled: true, start: "09:00", end: "18:00" },
  "6": { enabled: true, start: "09:00", end: "16:00" },
  "0": { enabled: false, start: "09:00", end: "16:00" },
};

const KNOWN_PHONE_KEYS = /^(telefone|phone|celular|whatsapp|número|numero)$/i;
const KNOWN_NAME_KEYS = /^(nome|name)$/i;

export function buildPreview(template: string, contact: ContactRow | undefined): string {
  if (!contact) return template;
  let msg = template;
  msg = msg.replace(/{nome}/gi, contact.name || "");
  msg = msg.replace(/{primeiro_nome}/gi, (contact.name || "").split(/\s+/)[0] || "");
  for (const [key, val] of Object.entries(contact.variables)) {
    msg = msg.replace(new RegExp(`\\{${key}\\}`, "gi"), val);
  }
  return msg;
}

interface Options {
  onCreated: () => void;
  onOpenChange: (open: boolean) => void;
}

export function useCreateCampaignForm({ onCreated, onOpenChange }: Options) {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const { balance } = useTokens();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [sendingScheduleEnabled, setSendingScheduleEnabled] = useState(false);
  const [sendingSchedule, setSendingSchedule] = useState({ ...DEFAULT_SCHEDULE });
  const [contactSource, setContactSource] = useState<"csv" | "rfm">("csv");
  const [selectedRfmAudienceId, setSelectedRfmAudienceId] = useState("");
  const [loadingRfmContacts, setLoadingRfmContacts] = useState(false);

  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(/[,;\t]/).map(h => h.replace(/^"|"$/g, "").trim());
    return lines.slice(1).map(line => {
      const values = line.split(/[,;\t]/).map(v => v.replace(/^"|"$/g, "").trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] || ""; });
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
            const varKey = col.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_");
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
        .select("snapshot_id")
        .eq("audience_id", audienceId)
        .eq("tenant_id", tenantId)
        .limit(5000);
      if (error) throw error;
      // não há chave estrangeira entre membros e snapshots (o embed do PostgREST não funciona): busca em lotes
      const snapshotIds = (members || []).map((m) => m.snapshot_id);
      const snapshots: { customer_name: string | null; customer_phone: string | null; customer_email: string | null; revenue_total: number | null }[] = [];
      for (let i = 0; i < snapshotIds.length; i += 200) {
        const { data: chunk, error: chunkError } = await supabase
          .from("customer_rfm_snapshots")
          .select("customer_name, customer_phone, customer_email, revenue_total")
          .in("id", snapshotIds.slice(i, i + 200));
        if (chunkError) throw chunkError;
        snapshots.push(...(chunk || []));
      }
      const parsed: ContactRow[] = [];
      const seenPhones = new Set<string>();
      for (const snapshot of snapshots) {
        const name = snapshot.customer_name || "";
        const phone = (snapshot.customer_phone || "").replace(/\D/g, "");
        const email = snapshot.customer_email || "";
        if (!phone || phone.length < 10 || seenPhones.has(phone)) continue;
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

  const insertVariable = (varKey: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setMessageTemplate(prev => prev + `{${varKey}}`); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = messageTemplate.substring(0, start) + `{${varKey}}` + messageTemplate.substring(end);
    setMessageTemplate(newText);
    setTimeout(() => {
      textarea.focus();
      const pos = start + varKey.length + 2;
      textarea.setSelectionRange(pos, pos);
    }, 0);
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
        const ext = mediaFile.name.split(".").pop() || "bin";
        const filePath = `${tenantId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("campaign-media").upload(filePath, mediaFile, { upsert: true });
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
          const offsetMs = sign * (parseInt(match[2]) * 60 + parseInt(match[3])) * 60 * 1000;
          const localOffsetMs = localDate.getTimezoneOffset() * 60 * 1000;
          scheduledAt = new Date(localDate.getTime() + localOffsetMs - offsetMs).toISOString();
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
      const { data: campaign, error: campError } = await supabase.from("bulk_campaigns").insert(insertPayload).select().single();
      if (campError) throw campError;
      const contactRows = contacts.map(c => ({ campaign_id: campaign.id, tenant_id: tenantId, name: c.name, phone: c.phone, variables: c.variables }));
      for (let i = 0; i < contactRows.length; i += 500) {
        const { error: cErr } = await supabase.from("campaign_contacts").insert(contactRows.slice(i, i + 500));
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

  return {
    campaignName, setCampaignName, messageTemplate, setMessageTemplate,
    selectedIntegration, setSelectedIntegration, delayMin, setDelayMin, delayMax, setDelayMax,
    contacts, fileName, saving, extraColumns,
    mediaFile, mediaPreview, removeMedia, handleMediaUpload,
    scheduledDate, setScheduledDate, scheduledTime, setScheduledTime, timezone, setTimezone,
    sendingScheduleEnabled, setSendingScheduleEnabled, sendingSchedule, setSendingSchedule,
    contactSource, setContactSource, selectedRfmAudienceId, setSelectedRfmAudienceId,
    loadingRfmContacts, loadRfmAudienceContacts, setContacts, setFileName,
    textareaRef, insertVariable, handleFileUpload,
    resetForm, handleCreate,
  };
}
