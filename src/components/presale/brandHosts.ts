// Subdomínios de loja -> página pública (slug em presale_pages). O nginx entrega o HTML com
// título/ícone/prévia da loja para esses mesmos hosts (nginx.conf, scripts/brand-pages.mjs).
export interface BrandHost { slug: string; page: "vip" | "cadastro" }

const BRAND_HOSTS: Record<string, BrandHost> = {
  "grupovip.lojaoutback.com.br": { slug: "outback", page: "vip" },
  "cadastro.lojaoutback.com.br": { slug: "outback", page: "cadastro" },
};

export const brandHost: BrandHost | null =
  typeof window === "undefined" ? null : BRAND_HOSTS[window.location.hostname.toLowerCase()] ?? null;
