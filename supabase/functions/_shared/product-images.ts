/**
 * Melhor qualidade disponível de uma imagem de produto.
 *
 * A CDN da Loja Integrada guarda a imagem original em `https://cdn.awsli.com.br/<caminho>` e gera as versões
 * reduzidas em `https://cdn.awsli.com.br/<largura>x<altura>/<caminho>` (64x64, 210x210, 380x380, 800x800...).
 * O banco guarda a de 800x800; para enviar (WhatsApp, e-mail) usamos o original.
 * Obs.: o original da LI costuma ter no máximo ~1024 px no lado maior (medido em 14 produtos: 682x1024, 754x1024,
 * 1000x1000). Pedir tamanhos maiores só estica a imagem e não acrescenta detalhe.
 * Mantenha igual a src/lib/product-images.ts.
 */
const LI_SIZED_URL = /^(https?:\/\/cdn\.awsli\.com\.br)\/\d+x\d+\/(.+)$/i;

export function hdImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(LI_SIZED_URL);
  return m ? `${m[1]}/${m[2]}` : url;
}
