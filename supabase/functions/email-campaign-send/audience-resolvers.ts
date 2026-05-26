import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type Supabase = ReturnType<typeof createClient>;

export type Recipient = { email: string; name: string | null; phone: string | null };
export type AudienceFilters = { integration_id?: string; tag_ids?: string[]; name_contains?: string; email_contains?: string; phone_contains?: string; doc_contains?: string; updated_from?: string; updated_to?: string };

export function normalizeEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

export function safeParseAudienceReference(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { const parsed = JSON.parse(raw); return typeof parsed === "object" && parsed !== null ? parsed : {}; }
  catch { return {}; }
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function resolveAudienceFilters(supabase: Supabase, tenantId: string, audienceType: string, audienceReference: Record<string, unknown>): Promise<AudienceFilters> {
  if (audienceType === "segment") {
    const segmentId = String(audienceReference.segment_id || "").trim();
    if (!segmentId) throw new Error("segment_id é obrigatório para audiência por segmento");
    const { data: segment, error } = await supabase.from("crm_segments").select("filters").eq("id", segmentId).eq("tenant_id", tenantId).maybeSingle();
    if (error || !segment) throw new Error("Segmento não encontrado");
    return (segment.filters as AudienceFilters) || {};
  }
  if (audienceType === "custom" || audienceType === "filters") {
    const filters = audienceReference.filters;
    return (typeof filters === "object" && filters !== null ? (filters as AudienceFilters) : {}) || {};
  }
  if (audienceType === "all") return {};
  throw new Error(`Tipo de audiência desconhecido: "${audienceType}". Envio bloqueado por segurança.`);
}

async function fetchRfmAudienceRecipients(supabase: Supabase, tenantId: string, audienceId: string): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("rfm_audience_members").select(`snapshot_id, customer_rfm_snapshots!inner (customer_name, customer_phone, customer_email, customer_data)`).eq("audience_id", audienceId).eq("tenant_id", tenantId).range(from, from + 499);
    if (error) throw error;
    for (const row of data || []) {
      const snapshot = (row as Record<string, unknown>).customer_rfm_snapshots as Record<string, unknown>;
      if (!snapshot) continue;
      const email = normalizeEmail(snapshot.customer_email as string || (snapshot.customer_data as Record<string, unknown>)?.email as string);
      if (!email) continue;
      recipients.push({ email, name: snapshot.customer_name as string || (snapshot.customer_data as Record<string, unknown>)?.name as string || null, phone: snapshot.customer_phone as string || (snapshot.customer_data as Record<string, unknown>)?.phone as string || null });
    }
    if (!data || data.length < 500) break;
    from += 500;
  }
  const deduped = new Map<string, Recipient>();
  for (const r of recipients) { if (!deduped.has(r.email)) deduped.set(r.email, r); }
  return Array.from(deduped.values());
}

export async function fetchRecipientsByFilters(supabase: Supabase, tenantId: string, filters: AudienceFilters): Promise<Recipient[]> {
  let eligibleCustomerIds: string[] | null = null;
  if (Array.isArray(filters.tag_ids) && filters.tag_ids.length > 0) {
    const { data: tagRows, error: tagError } = await supabase.from("customer_tags").select("customer_id").eq("tenant_id", tenantId).in("tag_id", filters.tag_ids);
    if (tagError) throw tagError;
    eligibleCustomerIds = Array.from(new Set((tagRows || []).map((row: Record<string, unknown>) => row.customer_id))).filter(Boolean);
    if (eligibleCustomerIds.length === 0) return [];
  }

  const fetchLiCustomers = async (): Promise<Recipient[]> => {
    const recipients: Recipient[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from("li_customers").select("id,email,name,phone").eq("tenant_id", tenantId).not("email", "is", null);
      if (filters.integration_id) query = query.eq("integration_id", filters.integration_id);
      if (filters.name_contains) query = query.ilike("name", `%${filters.name_contains}%`);
      if (filters.email_contains) query = query.ilike("email", `%${filters.email_contains}%`);
      if (filters.phone_contains) query = query.ilike("phone", `%${filters.phone_contains}%`);
      if (filters.doc_contains) query = query.ilike("doc", `%${filters.doc_contains}%`);
      if (filters.updated_from) query = query.gte("updated_at_local", filters.updated_from);
      if (filters.updated_to) query = query.lte("updated_at_local", filters.updated_to);
      if (eligibleCustomerIds) query = query.in("id", eligibleCustomerIds);
      const { data, error } = await query.order("updated_at_local", { ascending: false, nullsFirst: false }).range(from, from + 499);
      if (error) throw error;
      for (const row of data || []) { const email = normalizeEmail((row as Record<string, unknown>).email as string); if (email) recipients.push({ email, name: (row as Record<string, unknown>).name as string || null, phone: (row as Record<string, unknown>).phone as string || null }); }
      if (!data || data.length < 500) break;
      from += 500;
    }
    return recipients;
  };

  const fetchBlingCustomers = async (): Promise<Recipient[]> => {
    if (eligibleCustomerIds) return [];
    const recipients: Recipient[] = [];
    let from = 0;
    while (true) {
      let query = supabase.from("bling_customers").select("id,email,nome,celular,telefone").eq("tenant_id", tenantId).not("email", "is", null);
      if (filters.integration_id) query = query.eq("integration_id", filters.integration_id);
      if (filters.name_contains) query = query.ilike("nome", `%${filters.name_contains}%`);
      if (filters.email_contains) query = query.ilike("email", `%${filters.email_contains}%`);
      const { data, error } = await query.order("created_at", { ascending: false, nullsFirst: false }).range(from, from + 499);
      if (error) throw error;
      for (const row of data || []) { const email = normalizeEmail((row as Record<string, unknown>).email as string); if (email) recipients.push({ email, name: (row as Record<string, unknown>).nome as string || null, phone: ((row as Record<string, unknown>).celular || (row as Record<string, unknown>).telefone) as string || null }); }
      if (!data || data.length < 500) break;
      from += 500;
    }
    return recipients;
  };

  const [liRecipients, blingRecipients] = await Promise.all([fetchLiCustomers(), fetchBlingCustomers()]);
  const deduped = new Map<string, Recipient>();
  for (const recipient of [...liRecipients, ...blingRecipients]) { if (!deduped.has(recipient.email)) deduped.set(recipient.email, recipient); }
  return Array.from(deduped.values());
}

export async function resolveRecipients(supabase: Supabase, tenantId: string, audienceType: string, audienceReference: Record<string, unknown>): Promise<Recipient[]> {
  if (audienceType === "manual") {
    const emails = Array.isArray(audienceReference.emails) ? audienceReference.emails : [];
    const deduped = new Set<string>();
    for (const email of emails) { const normalized = normalizeEmail(String(email)); if (normalized) deduped.add(normalized); }
    return Array.from(deduped).map((email) => ({ email, name: null, phone: null }));
  }
  if (audienceType === "rfm") {
    const audienceId = String(audienceReference.rfm_audience_id || "").trim();
    if (!audienceId) throw new Error("rfm_audience_id é obrigatório para audiência RFM");
    return fetchRfmAudienceRecipients(supabase, tenantId, audienceId);
  }
  const filters = await resolveAudienceFilters(supabase, tenantId, audienceType, audienceReference);
  return fetchRecipientsByFilters(supabase, tenantId, filters);
}
