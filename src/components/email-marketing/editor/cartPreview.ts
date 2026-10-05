/**
 * Exemplo do carrinho para a pré-visualização do editor: no envio real o servidor troca {{cart_items}} pelos itens da pessoa
 * (supabase/functions/_shared/abandonment-render.ts). Mantenha o visual igual ao de lá.
 */
const ROW = (name: string, variant: string, qty: number, price: string, hue: number) => `<tr>
<td width="84" valign="top" style="padding:10px 12px 10px 0;"><div style="width:72px;height:72px;border-radius:8px;background:hsl(${hue},35%,55%);"></div></td>
<td valign="top" style="padding:10px 8px 10px 0;font-family:Arial,Helvetica,sans-serif;"><span style="color:inherit;font-size:15px;font-weight:600;line-height:1.35;">${name}</span>
<div style="font-size:13px;color:inherit;opacity:.65;margin-top:2px;">${variant}</div><div style="font-size:13px;color:inherit;opacity:.65;margin-top:2px;">Qtd: ${qty}</div></td>
<td valign="top" align="right" style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;"><div style="font-size:15px;font-weight:700;color:inherit;white-space:nowrap;">${price}</div></td></tr>`;

export const SAMPLE_CART_HTML = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${ROW("Camiseta Chronic Oversized", "Tamanho: M · Cor: Preto", 1, "R$ 129,90", 210)}${ROW("Boné Chronic Aba Reta", "Cor: Verde", 2, "R$ 179,80", 130)}<tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid rgba(128,128,128,.35);font-family:Arial,Helvetica,sans-serif;font-size:14px;color:inherit;">Total do carrinho</td><td align="right" style="padding:12px 0 0;border-top:1px solid rgba(128,128,128,.35);font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:inherit;white-space:nowrap;">R$ 309,70</td></tr></table>`;

const SAMPLES: Record<string, string> = {
  cart_items: SAMPLE_CART_HTML, cart_total: "R$ 309,70", cart_count: "3", cart_url: "#", product_name: "Camiseta Chronic Oversized", product_url: "#",
};

/** Só na pré-visualização: mostra um carrinho de exemplo no lugar das variáveis de recuperação. */
export function withPreviewSamples(html: string): string {
  if (!html.includes("{{")) return html;
  return html.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (m, key: string) => (key in SAMPLES ? SAMPLES[key] : m));
}
