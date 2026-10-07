/**
 * Base de conhecimento da loja (FAQ, politicas, guias) para a IA.
 * Busca por texto em portugues, sem acento, SEMPRE restrita ao tenant da conversa.
 */

import { extractSearchTerms } from "./ai-chat-catalog.ts";

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

export interface KnowledgeDoc { title: string; category?: string | null; content: string }

const MAX_DOC_CHARS = 1500;

export function formatKnowledgeBlock(docs: KnowledgeDoc[]): string {
  if (!docs.length) return '';
  const items = docs.map((d) => {
    const text = d.content.length > MAX_DOC_CHARS ? `${d.content.slice(0, MAX_DOC_CHARS)}…` : d.content;
    return `### ${d.title}${d.category ? ` (${d.category})` : ''}\n${text}`;
  });
  return `\n=== BASE DE CONHECIMENTO DA LOJA ===\n${items.join('\n\n')}\nSe a pergunta for respondida acima, use exatamente estas informações.\n`;
}

/** Documentos da loja relacionados a pergunta; vazio se nao houver termos uteis ou resultado. */
export async function buildKnowledgeInfo(supabase: ServiceClient, tenantId: string, question: string): Promise<string> {
  const terms = extractSearchTerms(question, 6);
  if (!terms.length) return '';
  const { data, error } = await supabase.rpc('search_knowledge_docs', { p_tenant: tenantId, p_terms: terms, p_limit: 3 });
  if (error || !Array.isArray(data)) return '';
  return formatKnowledgeBlock(data as KnowledgeDoc[]);
}
