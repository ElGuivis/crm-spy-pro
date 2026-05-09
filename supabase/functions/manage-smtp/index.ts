import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireUserAuth } from "../_shared/auth-guard.ts";
import { requireResource } from "../_shared/resource-guard.ts";
import { getRestrictedCorsHeaders } from "../_shared/cors.ts";
import { getCorrelationId, createLogger } from "../_shared/correlation.ts";

/**
 * manage-smtp — Server-side CRUD for email_integrations.
 *
 * Actions:
 *   - upsert: Create or update an SMTP integration (password encrypted server-side)
 *   - get:    Return integration data with masked password
 *   - delete: Remove an integration
 *
 * The smtp_password NEVER leaves the server in plaintext.
 */

serve(async (req) => {
  const corsHeaders = getRestrictedCorsHeaders(req);

  const cid = getCorrelationId(req);
  const log = createLogger("manage-smtp", cid);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { userId, tenantId } = await requireUserAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Only tenant admins can manage SMTP
    const { data: isAdmin } = await supabase.rpc("is_tenant_admin", {
      _user_id: userId,
      _tenant_id: tenantId,
    });
    if (!isAdmin) {
      return json({ error: "Apenas administradores podem gerenciar SMTP" }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // =========================================================================
    // ACTION: upsert — Create or update SMTP integration
    // =========================================================================
    if (action === "upsert") {
      const {
        id,
        name,
        sender_name,
        sender_email,
        smtp_host,
        smtp_port,
        smtp_user,
        smtp_password,
        smtp_secure,
        smtp_tls,
        reply_to,
        daily_send_limit,
        max_sends_per_second,
      } = body;

      if (!name || !sender_email || !smtp_host || !smtp_user) {
        return json({ error: "Campos obrigatórios faltando" }, 400);
      }

      // Build the row data — password will be encrypted by the DB trigger
      const row: Record<string, unknown> = {
        name,
        sender_name: sender_name || null,
        sender_email,
        smtp_host,
        smtp_port: smtp_port || 587,
        smtp_user,
        smtp_secure: smtp_secure ?? false,
        smtp_tls: smtp_tls ?? true,
        reply_to: reply_to || null,
        daily_send_limit: daily_send_limit || null,
        max_sends_per_second: max_sends_per_second || null,
        tenant_id: tenantId,
      };

      // Only set smtp_password when provided (create or password change)
      if (smtp_password && smtp_password.trim() !== "") {
        row.smtp_password = smtp_password;
      }

      let integrationId = id;

      if (id) {
        // Update — verify ownership via requireResource (IDOR protection)
        await requireResource(supabase, "email_integrations", id, tenantId, req);

        const { error } = await supabase
          .from("email_integrations")
          .update(row)
          .eq("id", id)
          .eq("tenant_id", tenantId);

        if (error) throw error;
      } else {
        // Create — password is required
        if (!smtp_password || smtp_password.trim() === "") {
          return json({ error: "Senha SMTP é obrigatória para nova integração" }, 400);
        }

        const { data: newRow, error } = await supabase
          .from("email_integrations")
          .insert([row])
          .select("id")
          .single();

        if (error) throw error;
        integrationId = newRow.id;
      }

      return json({ success: true, id: integrationId });
    }

    // =========================================================================
    // ACTION: get — Return integration with masked password
    // =========================================================================
    if (action === "get") {
      const { data, error } = await supabase
        .from("email_integrations")
        .select("id, name, sender_name, sender_email, smtp_host, smtp_port, smtp_user, smtp_secure, smtp_tls, reply_to, is_active, created_at, daily_send_limit, max_sends_per_second, smtp_password_encrypted")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Return masked password indicator (never the actual password)
      const masked = (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        has_password: !!(row.smtp_password_encrypted),
        smtp_password_encrypted: undefined, // strip ciphertext
      }));

      return json({ data: masked });
    }

    // =========================================================================
    // ACTION: delete — Remove integration
    // =========================================================================
    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id é obrigatório" }, 400);

      // Verify ownership via requireResource (IDOR protection)
      await requireResource(supabase, "email_integrations", id, tenantId, req);

      // NULL out nullable FK references so configs are preserved
      await supabase.from("birthday_configs").update({ email_integration_id: null }).eq("email_integration_id", id).eq("tenant_id", tenantId);
      await supabase.from("cashback_configs").update({ email_integration_id: null }).eq("email_integration_id", id).eq("tenant_id", tenantId);
      await supabase.from("order_notification_configs").update({ email_integration_id: null }).eq("email_integration_id", id).eq("tenant_id", tenantId);

      // Delete child rows that directly depend on this email integration
      await supabase.from("email_campaigns").delete().eq("email_integration_id", id).eq("tenant_id", tenantId);
      await supabase.from("email_integration_senders").delete().eq("integration_id", id).eq("tenant_id", tenantId);

      const { error } = await supabase
        .from("email_integrations")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
      return json({ success: true });
    }

    // =========================================================================
    // ACTION: list-senders — List senders for an integration
    // =========================================================================
    if (action === "list-senders") {
      const { integration_id } = body;
      if (!integration_id) return json({ error: "integration_id é obrigatório" }, 400);

      // Verify integration belongs to tenant via requireResource (IDOR protection)
      await requireResource(supabase, "email_integrations", integration_id, tenantId, req);

      const { data, error } = await supabase
        .from("email_integration_senders")
        .select("id, sender_email, sender_name, is_active")
        .eq("integration_id", integration_id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return json({ data: data || [] });
    }

    // =========================================================================
    // ACTION: save-senders — Batch upsert senders for an integration
    // =========================================================================
    if (action === "save-senders") {
      const { integration_id, senders } = body;
      if (!integration_id) return json({ error: "integration_id é obrigatório" }, 400);
      if (!Array.isArray(senders)) return json({ error: "senders deve ser um array" }, 400);

      // Verify integration belongs to tenant via requireResource (IDOR protection)
      await requireResource(supabase, "email_integrations", integration_id, tenantId, req);

      for (const sender of senders) {
        if (!sender.sender_email || !sender.sender_email.trim()) continue;

        if (sender.id && !sender.isNew) {
          // Update — verify ownership via tenant_id
          await supabase
            .from("email_integration_senders")
            .update({
              sender_email: sender.sender_email,
              sender_name: sender.sender_name || null,
              is_active: sender.is_active,
            })
            .eq("id", sender.id)
            .eq("tenant_id", tenantId);
        } else {
          await supabase
            .from("email_integration_senders")
            .insert({
              integration_id,
              tenant_id: tenantId,
              sender_email: sender.sender_email,
              sender_name: sender.sender_name || null,
              is_active: sender.is_active,
            });
        }
      }

      return json({ success: true });
    }

    // =========================================================================
    // ACTION: delete-sender — Remove a single sender
    // =========================================================================
    if (action === "delete-sender") {
      const { sender_id } = body;
      if (!sender_id) return json({ error: "sender_id é obrigatório" }, 400);

      const { error } = await supabase
        .from("email_integration_senders")
        .delete()
        .eq("id", sender_id)
        .eq("tenant_id", tenantId);

      if (error) throw error;
      return json({ success: true });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("[manage-smtp] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
