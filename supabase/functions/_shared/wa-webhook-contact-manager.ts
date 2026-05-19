import type { WaCtx } from "./wa-webhook-types.ts";
import { CONTACT_COLUMNS } from "./select-columns.ts";

/** Find an existing contact or create a new one, handling LID merge logic.
 *  Mutates ctx.contact on success. Returns null to continue pipeline. */
export async function findOrCreateContact(ctx: WaCtx): Promise<Response | null> {
  const { supabase, log, tenantId, phone, isLidContact, lidIdentifier, realPhoneFromAlt, contactName } = ctx;

  let { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select(CONTACT_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('phone', phone)
    .single();

  // Try by lid_identifier stored in metadata
  if (!contact && isLidContact && lidIdentifier) {
    const { data: lidContactByMeta } = await supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('metadata->>lid_identifier', lidIdentifier)
      .maybeSingle();
    if (lidContactByMeta) {
      log.info('📱 Contato encontrado via lid_identifier no metadata:', lidContactByMeta.id, 'phone atual:', lidContactByMeta.phone);
      contact = lidContactByMeta;
      contactError = null;
    }
  }

  // Legacy: contact still has @lid in phone — update to real phone
  if (!contact && isLidContact && realPhoneFromAlt && lidIdentifier) {
    const { data: lidContact } = await supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('phone', lidIdentifier)
      .single();
    if (lidContact) {
      log.info('📱 Atualizando contato LID existente com número real:', realPhoneFromAlt);
      const existingMetadata = (lidContact.metadata || {}) as Record<string, unknown>;
      await supabase
        .from('contacts')
        .update({
          phone: realPhoneFromAlt,
          metadata: { ...existingMetadata, lid_identifier: lidIdentifier, phone_updated_at: new Date().toISOString(), phone_source: 'remoteJidAlt' },
        })
        .eq('id', lidContact.id);
      contact = { ...lidContact, phone: realPhoneFromAlt };
      contactError = null;
    }
  }

  if (contactError && contactError.code === 'PGRST116') {
    const contactMetadata: Record<string, unknown> = {};
    if (isLidContact && lidIdentifier) {
      contactMetadata.lid_identifier = lidIdentifier;
      contactMetadata.created_from_lid = true;
      contactMetadata.has_real_phone = !!realPhoneFromAlt;
      if (!realPhoneFromAlt) contactMetadata.needs_phone_capture = true;
    }
    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert({ tenant_id: tenantId, phone, name: contactName, metadata: contactMetadata })
      .select()
      .single();
    if (createError) {
      log.error('❌ Error creating contact:', createError);
      throw createError;
    }
    contact = newContact;
    log.info('👤 New contact created:', contact.id, `phone: ${phone}`, isLidContact ? `(LID: ${lidIdentifier})` : '');
  } else if (contactError) {
    throw contactError;
  } else {
    if (contact.name !== contactName && contactName !== phone) {
      await supabase.from('contacts').update({ name: contactName }).eq('id', contact.id);
    }
    if (contact.phone.includes('@lid') && realPhoneFromAlt) {
      log.info('📱 Atualizando phone do contato LID para número real:', realPhoneFromAlt);
      const existingMetadata = (contact.metadata || {}) as Record<string, unknown>;
      await supabase
        .from('contacts')
        .update({
          phone: realPhoneFromAlt,
          metadata: { ...existingMetadata, lid_identifier: contact.phone, phone_updated_at: new Date().toISOString(), phone_source: 'remoteJidAlt' },
        })
        .eq('id', contact.id);
      contact.phone = realPhoneFromAlt;
    }
  }

  ctx.contact = contact;
  return null;
}
