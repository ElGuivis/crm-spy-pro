import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { requireInternalAuth } from "../_shared/auth-guard.ts";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    requireInternalAuth(req);
    const { field_name, field_value } = await req.json();
    if (!field_name || !field_value) throw new Error("field_name and field_value required");

    let valid = false;
    let normalized = field_value.trim();
    let error: string | null = null;

    switch (field_name) {
      case "email": {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        valid = emailRegex.test(normalized);
        normalized = normalized.toLowerCase();
        if (!valid) error = "Formato de e-mail inválido";
        break;
      }
      case "phone": {
        // Remove non-digits
        const digits = normalized.replace(/\D/g, "");
        // Accept BR phones (10-11 digits) or international (8-15 digits)
        valid = digits.length >= 8 && digits.length <= 15;
        if (valid) {
          // Normalize BR phones
          if (digits.length === 10 || digits.length === 11) {
            normalized = `+55${digits}`;
          } else if (!digits.startsWith("55") && digits.length <= 11) {
            normalized = `+55${digits}`;
          } else {
            normalized = `+${digits}`;
          }
        } else {
          error = "Formato de telefone inválido";
        }
        break;
      }
      case "number": {
        const num = Number(normalized);
        valid = !isNaN(num);
        if (!valid) error = "Valor numérico inválido";
        break;
      }
      default: {
        // text - any non-empty value is valid
        valid = normalized.length > 0;
        if (!valid) error = "Valor não pode ser vazio";
      }
    }

    return new Response(JSON.stringify({ valid, normalized, error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
