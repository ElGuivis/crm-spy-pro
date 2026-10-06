import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { formatPhoneNumber } from "../_shared/whatsapp-sender.ts";
import { requireUserAuth, assertTenantMatch } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";
import { pickCatalogImages, MAX_CATALOG_PHOTOS } from "../_shared/catalog-images.ts";

interface ProductPayload {
  id: string;
  name: string;
  price: number | null;
  stock: number;
  image_url: string | null;
  /** até 3 fotos do mesmo produto, na ordem de envio (a primeira leva a legenda); sem isto vale image_url */
  image_urls?: string[];
  variations: string[];
  source: 'li' | 'bling';
}

Deno.serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("whatsapp-send-catalog", cid);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenantId: authTenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const { tenant_id, integration_id, phone, include_price, include_stock, send_as_document, products } = body as {
      tenant_id: string;
      integration_id: string;
      phone: string;
      include_price: boolean;
      include_stock: boolean;
      send_as_document: boolean;
      products: ProductPayload[];
    };

    assertTenantMatch(authTenantId, tenant_id, req);

    if (!tenant_id || !phone || !products?.length) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate integration ownership via requireResource
    if (integration_id) {
      await requireResource(supabase, "integrations", integration_id, authTenantId, req);
    }

    // Check token balance
    const totalCost = products.length;
    const { data: hasTokens } = await supabase.rpc('has_enough_tokens', { _tenant_id: authTenantId, _amount: totalCost });
    if (!hasTokens) {
      return new Response(JSON.stringify({ error: 'INSUFFICIENT_TOKENS', sent: 0, failed: products.length, token_cost: 0 }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get WhatsApp config from integration — scoped to authenticated tenant
    const { data: whatsappIntegrations } = await supabase
      .from('integrations')
      .select('id, metadata')
      .eq('tenant_id', authTenantId)
      .in('type', ['evolution_whatsapp'])
      .eq('status', 'connected')
      .limit(1);

    if (!whatsappIntegrations?.length) {
      return new Response(JSON.stringify({ error: 'No active WhatsApp integration found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const whatsappMeta = whatsappIntegrations[0].metadata as Record<string, unknown>;
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const instanceName = whatsappMeta?.instance_name || whatsappMeta?.instanceName;

    if (!instanceName) {
      return new Response(JSON.stringify({ error: 'WhatsApp instance not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phoneInfo = formatPhoneNumber(phone);
    const numberToSend = phoneInfo.isLid ? `${phoneInfo.number}@lid` : phoneInfo.number;
    const baseUrl = evolutionApiUrl.replace(/\/$/, '');

    let sent = 0;        // produtos entregues (a 1ª foto saiu)
    let failed = 0;      // produtos que não saíram
    let skipped = 0;     // produtos que ficaram de fora por falta de tempo (não são cobrados)
    let imagesSent = 0;  // fotos entregues no total
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 110_000;

    const sendImage = async (media: string, caption?: string): Promise<boolean> => {
      const response = await fetch(`${baseUrl}/message/sendMedia/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: numberToSend, mediatype: 'image', media, ...(caption ? { caption } : {}) }),
      });
      if (!response.ok) log.error(`[CATALOG] ❌ Evolution recusou ${media}: ${await response.text()}`);
      return response.ok;
    };

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (Date.now() - startedAt > TIME_BUDGET_MS) { skipped += products.length - i; log.info(`[CATALOG] Tempo esgotado: ${products.length - i} produto(s) não enviado(s)`); break; }
      try {
        // Legenda: nome + preço, só na primeira foto
        let caption = `*${product.name}*`;
        if (include_price && product.price) {
          caption += `\n💰 R$ ${product.price.toFixed(2).replace('.', ',')}`;
        }

        const images = pickCatalogImages(product).slice(0, MAX_CATALOG_PHOTOS);
        if (images.length === 0) {
          log.info(`[CATALOG] Skipping ${product.name} - no image`);
          failed++;
          continue;
        }

        log.info(`[CATALOG] Sending ${product.name} (${images.length} foto(s))`);
        if (await sendImage(images[0], caption)) {
          sent++; imagesSent++;
          log.info(`[CATALOG] ✅ Sent ${product.name}`);
          for (const extra of images.slice(1)) {
            await new Promise(r => setTimeout(r, 1000));
            if (await sendImage(extra)) imagesSent++;
          }
        } else {
          failed++;
        }

        // Rate limit delay (1.5s between products)
        if (i < products.length - 1) await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        log.error(`[CATALOG] Exception sending ${product.name}:`, err);
        failed++;
      }
    }

    // Deduct tokens for successfully sent images
    if (sent > 0) {
      await supabase.rpc('deduct_tokens', {
        _tenant_id: authTenantId,
        _amount: sent,
        _type: 'whatsapp_catalog',
        _description: `Catálogo WhatsApp: ${sent} produto(s) enviado(s) (${imagesSent} foto(s))`,
        _reference_id: integration_id,
      });
    }

    return new Response(JSON.stringify({ sent, failed, skipped, images_sent: imagesSent, token_cost: sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    if (error instanceof Response) return error;
    log.error('[CATALOG] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
