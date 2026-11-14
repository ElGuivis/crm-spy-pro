import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { clientIp, withinRateLimit } from "../_shared/rate-limit.ts";

// Redirecionador de links curtos (https://<dominio curto da loja>/<codigo>). Endpoint PÚBLICO de propósito:
// só redireciona para o endereço gravado em short_links; código inexistente cai na página inicial do CRM.
const NOT_FOUND_URL = "https://spypro.com.br";

Deno.serve(async (req) => {
  const code = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!/^[a-z0-9]{4,12}$/.test(code) || code === "r") return Response.redirect(NOT_FOUND_URL, 302);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // clique: 600/min por IP (acima disso o redirecionamento continua, só deixa de contar)
  if (!(await withinRateLimit(supabase, `short:${clientIp(req)}`, 600, 60))) return Response.redirect(NOT_FOUND_URL, 302);

  const { data, error } = await supabase.rpc("short_link_hit", { p_code: code });
  const row = (Array.isArray(data) ? data[0] : data) as { url?: string } | null;
  if (error || !row?.url) return Response.redirect(NOT_FOUND_URL, 302);
  return new Response(null, { status: 302, headers: { Location: row.url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
