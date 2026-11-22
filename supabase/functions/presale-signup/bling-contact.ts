// Contato no Bling (API v3) para a página de cadastro: procura pelo CPF; se não existir, cria como "Cliente".
// Contato que já existe NÃO é alterado (o PUT do Bling substitui o cadastro inteiro e apagaria o que a loja preencheu à mão).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureBlingToken } from "../_shared/bling-token-refresh.ts";
import { formatBrPhone, type PresaleInput } from "./validate.ts";

const BASE = "https://api.bling.com.br/Api/v3";

export type BlingContactResult =
  | { status: "created" | "existing"; contactId: number }
  | { status: "failed"; error: string };

async function call(token: string, path: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> | null }> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    // limite do Bling: 3 por segundo
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    return { status: res.status, body };
  }
}

function blingError(body: Record<string, unknown> | null, status: number): string {
  const e = body?.error as { message?: string; description?: string; fields?: Array<{ msg?: string }> } | undefined;
  const fields = e?.fields?.map((f) => f.msg).filter(Boolean).join("; ");
  return `HTTP ${status}${e?.message ? `: ${e.message}` : ""}${e?.description ? ` (${e.description})` : ""}${fields ? ` [${fields}]` : ""}`.slice(0, 500);
}

export async function upsertBlingContact(sb: SupabaseClient, tenantId: string, input: PresaleInput): Promise<BlingContactResult> {
  try {
    const { data: conn } = await sb.from("bling_connections").select("*").eq("tenant_id", tenantId).eq("status", "connected").maybeSingle();
    if (!conn) return { status: "failed", error: "Bling não conectado" };
    // o helper compartilhado é tipado com o cliente sem genéricos
    const token = await ensureBlingToken(sb as unknown as Parameters<typeof ensureBlingToken>[0], conn, "[presale-signup]");

    const found = await call(token, `contatos?numeroDocumento=${input.cpf}`);
    if (found.status !== 200) return { status: "failed", error: `busca ${blingError(found.body, found.status)}` };
    const existing = (found.body?.data as Array<{ id: number }> | undefined)?.[0];
    if (existing) return { status: "existing", contactId: existing.id };

    const tipos = await call(token, "contatos/tipos");
    const cliente = (tipos.body?.data as Array<{ id: number; descricao: string }> | undefined)
      ?.find((t) => t.descricao.trim().toLowerCase() === "cliente");

    const a = input.address;
    const payload: Record<string, unknown> = {
      nome: input.name,
      situacao: "A",
      tipo: "F",
      numeroDocumento: input.cpf,
      indicadorIe: 9, // não contribuinte (pessoa física)
      celular: formatBrPhone(input.phone),
      email: input.email,
      emailNotaFiscal: input.email,
      endereco: {
        geral: {
          endereco: a.street,
          numero: a.number,
          complemento: a.complement,
          bairro: a.neighborhood,
          cep: `${a.cep.slice(0, 5)}-${a.cep.slice(5)}`,
          municipio: a.city,
          uf: a.state,
        },
      },
      dadosAdicionais: { dataNascimento: input.birthDate },
    };
    if (cliente) payload.tiposContato = [{ id: cliente.id }];

    const created = await call(token, "contatos", { method: "POST", body: JSON.stringify(payload) });
    const id = (created.body?.data as { id?: number } | undefined)?.id;
    if (created.status !== 201 && created.status !== 200 || typeof id !== "number") {
      return { status: "failed", error: `cadastro ${blingError(created.body, created.status)}` };
    }
    return { status: "created", contactId: id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
