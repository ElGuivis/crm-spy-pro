// Cliente na Loja Integrada para a pré-venda: procura pelo e-mail; se não existir, cria.
// API v1: GET /cliente/search?cliente_email=, POST /cliente (exige nome + email), PUT /cliente/{id}/grupo.
import { liAuthHeader } from "../_shared/li-auth.ts";
import { formatBrPhone, type PresaleInput } from "./validate.ts";

const BASE = "https://api.awsli.com.br/v1";

export type LiCustomerResult =
  | { status: "created" | "existing"; customerId: number }
  | { status: "failed"; error: string };

async function liFetch(url: string, init: RequestInit, token: string): Promise<Response> {
  const headers = { Authorization: liAuthHeader(token), "Content-Type": "application/json", Accept: "application/json" };
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) });
    // limite da loja: 100/min. Espera curta e tenta de novo (a pessoa está esperando na tela).
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    return res;
  }
}

function errorText(body: unknown, status: number): string {
  const b = body as { error_message?: string; error?: unknown } | null;
  const detail = b?.error ? JSON.stringify(b.error).slice(0, 300) : "";
  return `HTTP ${status}${b?.error_message ? `: ${b.error_message}` : ""}${detail ? ` ${detail}` : ""}`;
}

export async function upsertLiCustomer(token: string, input: PresaleInput, groupId: number | null): Promise<LiCustomerResult> {
  try {
    const search = await liFetch(`${BASE}/cliente/search?cliente_email=${encodeURIComponent(input.email)}`, { method: "GET" }, token);
    const found = await search.json().catch(() => null) as { objects?: Array<{ id: number; email?: string }> } | null;
    if (!search.ok) return { status: "failed", error: `busca ${errorText(found, search.status)}` };
    const existing = found?.objects?.find((c) => (c.email ?? "").toLowerCase() === input.email);
    if (existing) {
      if (groupId) {
        const r = await liFetch(`${BASE}/cliente/${existing.id}/grupo`, { method: "PUT", body: JSON.stringify({ grupo: groupId }) }, token);
        await r.body?.cancel();
      }
      return { status: "existing", customerId: existing.id };
    }

    const a = input.address;
    const payload: Record<string, unknown> = {
      nome: input.name,
      email: input.email,
      tipo: "PF",
      cpf: input.cpf,
      telefone_celular: formatBrPhone(input.phone),
      data_nascimento: input.birthDate,
      aceita_newsletter: input.acceptsNewsletter,
      enderecos: [{
        nome: input.name,
        endereco: a.street,
        numero: a.number,
        complemento: a.complement,
        bairro: a.neighborhood,
        cidade: a.city,
        estado: a.state,
        cep: `${a.cep.slice(0, 5)}-${a.cep.slice(5)}`,
        pais: "BRA",
      }],
    };
    if (groupId) payload.grupo_id = groupId;

    const res = await liFetch(`${BASE}/cliente`, { method: "POST", body: JSON.stringify(payload) }, token);
    const body = await res.json().catch(() => null) as { id?: number } | null;
    if (!res.ok || typeof body?.id !== "number") return { status: "failed", error: `cadastro ${errorText(body, res.status)}` };
    return { status: "created", customerId: body.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
