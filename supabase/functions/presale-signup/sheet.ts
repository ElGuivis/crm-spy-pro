// Envio para a planilha do Google pelo mesmo Apps Script da página antiga (fimdaout):
// GET <exec>?name=&phone=&email=&shirtSize=&pantsSize=&shoeSize=  (mesmos nomes de parâmetro).
// Sai do servidor (a página antiga mandava do navegador em no-cors, sem saber se gravou).

export interface SheetRow {
  name: string;
  phone: string;
  email: string;
  shirtSize: string;
  pantsSize: string;
  shoeSize: string;
}

export type SheetResult = { ok: true } | { ok: false; error: string };

export async function sendToSheet(execUrl: string, row: SheetRow): Promise<SheetResult> {
  const qs = new URLSearchParams({ ...row });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // o Apps Script responde 302 para googleusercontent: fetch segue sozinho
      const res = await fetch(`${execUrl}?${qs.toString()}`, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(12_000) });
      await res.body?.cancel();
      if (res.ok) return { ok: true };
      if (res.status < 500 && res.status !== 429) return { ok: false, error: `HTTP ${res.status}` };
    } catch (err) {
      if (attempt === 1) return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: false, error: "sem resposta da planilha" };
}
