import type { IntegrationMetadata } from "./wa-webhook-types.ts";

interface LidPhoneResult {
  phone: string;
  isLidContact: boolean;
  lidIdentifier: string | null;
  realPhoneFromAlt: string | null;
}

/** Resolve the real phone number from an Evolution webhook payload.
 *  For LID (@lid) contacts, tries multiple sources and filters out the
 *  instance's own number. Returns plain phone for normal contacts. */
export async function resolveLidPhone(
  supabase: any,
  payload: any,
  integrationEarly: { id: string; metadata: IntegrationMetadata } | null,
  instanceName: string,
  instancePhoneNumber: string,
  log: any,
): Promise<LidPhoneResult> {
  const remoteJid: string = payload.data.key.remoteJid;

  if (!remoteJid.endsWith('@lid')) {
    return {
      phone: remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', ''),
      isLidContact: false,
      lidIdentifier: null,
      realPhoneFromAlt: null,
    };
  }

  const lidIdentifier = remoteJid;

  log.info('🔍 LID DEBUG - Complete payload analysis:');
  log.info('🔍 LID DEBUG - payload.sender:', payload.sender);
  log.info('🔍 LID DEBUG - payload.data.key:', JSON.stringify(payload.data.key));
  log.info('🔍 LID DEBUG - payload.data.participant:', payload.data?.participant);
  log.info('🔍 LID DEBUG - payload.participant:', payload?.participant);

  const possiblePhoneSources: (string | undefined)[] = [
    payload.sender,
    payload.data.key?.remoteJidAlt,
    payload.data?.participant,
    payload?.participant,
  ];
  log.info('🔍 LID DEBUG - All possible sources:', possiblePhoneSources);

  let instancePhoneResolved = instancePhoneNumber;

  if (!instancePhoneResolved) {
    const { data: channelData } = await supabase
      .from('whatsapp_channels')
      .select('id, phone_e164')
      .eq('provider_account_id', instanceName)
      .maybeSingle();
    instancePhoneResolved = channelData?.phone_e164?.replace('+', '') || '';
    if (instancePhoneResolved) {
      log.info('📞 Instance phone resolved from whatsapp_channels:', instancePhoneResolved);
    }
  }

  if (!instancePhoneResolved) {
    try {
      const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || '';
      const evolutionApiKey = integrationEarly?.metadata?.apiKey || Deno.env.get('EVOLUTION_API_KEY') || '';
      if (evolutionUrl && evolutionApiKey) {
        const evResp = await fetch(`${evolutionUrl}/instance/fetchInstances?instanceName=${instanceName}`, {
          headers: { 'apikey': evolutionApiKey },
        });
        if (evResp.ok) {
          const evData = await evResp.json();
          const instanceData = Array.isArray(evData) ? evData[0] : evData;
          const ownerJid = instanceData?.instance?.ownerJid || instanceData?.ownerJid || '';
          if (ownerJid && ownerJid.includes('@s.whatsapp.net')) {
            instancePhoneResolved = ownerJid.replace('@s.whatsapp.net', '').replace('+', '');
            log.info('📞 Instance phone resolved from Evolution API:', instancePhoneResolved);
            const phoneFormatted = '+' + instancePhoneResolved;
            await supabase.from('whatsapp_channels').update({ phone_e164: phoneFormatted }).eq('provider_account_id', instanceName);
            if (integrationEarly?.id) {
              await supabase.from('integrations').update({ metadata: { ...(integrationEarly.metadata || {}), phoneNumber: instancePhoneResolved } }).eq('id', integrationEarly.id);
            }
            log.info('💾 Instance phone saved to DB:', phoneFormatted);
          }
        }
      }
    } catch (evErr) {
      log.error('⚠️ Could not fetch instance phone from Evolution API:', evErr);
    }
  }

  if (!instancePhoneResolved && payload.sender?.includes('@s.whatsapp.net')) {
    instancePhoneResolved = payload.sender.replace('@s.whatsapp.net', '');
    log.info('📞 Instance phone inferred from payload.sender:', instancePhoneResolved);
    const phoneFormatted = '+' + instancePhoneResolved;
    await supabase.from('whatsapp_channels').update({ phone_e164: phoneFormatted }).eq('provider_account_id', instanceName);
    if (integrationEarly?.id) {
      await supabase.from('integrations').update({ metadata: { ...(integrationEarly.metadata || {}), phoneNumber: instancePhoneResolved } }).eq('id', integrationEarly.id);
    }
    log.info('💾 Instance phone (from sender) saved to DB:', phoneFormatted);
  }

  let realPhoneFromAlt: string | null = null;
  for (const source of possiblePhoneSources) {
    if (source && source.includes('@s.whatsapp.net')) {
      const extractedNumber = source.replace('@s.whatsapp.net', '');
      if (instancePhoneResolved && extractedNumber === instancePhoneResolved) {
        log.info('⚠️ LID SKIP: sender é o número da própria instância:', extractedNumber);
        continue;
      }
      realPhoneFromAlt = extractedNumber;
      log.info('✅ LID contact - número REAL encontrado:', realPhoneFromAlt, 'fonte:', source);
      break;
    }
  }

  const phone = realPhoneFromAlt ?? remoteJid;
  if (!realPhoneFromAlt) {
    log.info('⚠️ LID contact SEM número real - usando LID temporariamente:', phone);
  }

  return { phone, isLidContact: true, lidIdentifier, realPhoneFromAlt };
}
