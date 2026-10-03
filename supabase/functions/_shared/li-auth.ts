// Autenticação da API da Loja Integrada (https://api-docs.lojaintegrada.com.br/).
// Personal Token (único por loja, gerado no painel): `Authorization: Basic <token>`.
// O modelo antigo (`chave_api ... aplicacao ...`, com chave de aplicação do integrador)
// foi descontinuado em 05/10/2026. O token fica em `integrations.api_key`.

export function liAuthHeader(personalToken: unknown): string {
  if (typeof personalToken !== "string" || !personalToken.trim()) {
    throw new Error("Personal Token da Loja Integrada ausente");
  }
  return `Basic ${personalToken.trim().replace(/^Basic\s+/i, "")}`;
}
