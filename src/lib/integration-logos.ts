/**
 * Centralized integration logo URLs and metadata.
 * All integration visual identity is managed here.
 */

export interface IntegrationBrand {
  logo: string;
  name: string;
  color: string; // tailwind bg class for icon container
}

const LOGOS: Record<string, IntegrationBrand> = {
  loja_integrada: {
    logo: "/logos/loja-integrada.png",
    name: "Loja Integrada",
    color: "bg-blue-500/10",
  },
  evolution_whatsapp: {
    logo: "/logos/whatsapp.svg",
    name: "WhatsApp",
    color: "bg-green-500/10",
  },
  ai_openai: {
    logo: "/logos/openai.svg",
    name: "OpenAI",
    color: "bg-emerald-500/10",
  },
  ai_google: {
    logo: "/logos/google-ai.svg",
    name: "Google AI",
    color: "bg-purple-500/10",
  },
  ai_groq: {
    logo: "/logos/groq.png",
    name: "Groq",
    color: "bg-orange-500/10",
  },
  ai_mistral: {
    logo: "/logos/mistral.png",
    name: "Mistral AI",
    color: "bg-cyan-500/10",
  },
  melhor_envio: {
    logo: "/logos/melhor-envio.png",
    name: "Melhor Envio",
    color: "bg-blue-500/10",
  },
  bling: {
    logo: "/logos/bling-icon.png",
    name: "Bling",
    color: "bg-green-600/10",
  },
  nuvemshop: {
    logo: "/logos/nuvemshop.svg",
    name: "Nuvemshop",
    color: "bg-sky-500/10",
  },
  email_smtp: {
    logo: "",
    name: "E-mail SMTP",
    color: "bg-blue-500/10",
  },
};

export function getIntegrationBrand(type: string): IntegrationBrand {
  return LOGOS[type] || { logo: "", name: type, color: "bg-muted" };
}

export function getIntegrationLogoUrl(type: string): string {
  return LOGOS[type]?.logo || "";
}

export function getIntegrationColor(type: string): string {
  return LOGOS[type]?.color || "bg-muted";
}
