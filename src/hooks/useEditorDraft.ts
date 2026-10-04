import { useCallback, useEffect, useRef, useState } from "react";
import type { EmailContent } from "@/components/email-marketing/editor/types";

const SAVE_DELAY_MS = 1500;
const MAX_AGE_MS = 14 * 24 * 3600 * 1000;
const PREFIX = "email-editor-draft:";

interface Stored { content: EmailContent; savedAt: number }

const read = (key: string): Stored | null => {
  try { const raw = localStorage.getItem(PREFIX + key); return raw ? (JSON.parse(raw) as Stored) : null; } catch { return null; }
};
const write = (key: string, value: Stored | null) => {
  try { if (value) localStorage.setItem(PREFIX + key, JSON.stringify(value)); else localStorage.removeItem(PREFIX + key); } catch { /* storage cheio ou bloqueado: segue sem rascunho */ }
};
/** Apaga rascunhos de versões antigas (a chave muda a cada salvamento da campanha/modelo). */
const prune = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const s = JSON.parse(localStorage.getItem(k) ?? "null") as Stored | null;
      if (!s || Date.now() - s.savedAt > MAX_AGE_MS) localStorage.removeItem(k);
    }
  } catch { /* ignora */ }
};

/**
 * Rascunho automático do editor no navegador. `draftKey` deve incluir a versão salva (ex.: id + updated_at):
 * ao salvar, a chave muda e o rascunho antigo deixa de valer, sem sobrescrever o que foi salvo.
 */
export function useEditorDraft(draftKey: string | undefined, initialContent: EmailContent | undefined) {
  const [restorable, setRestorable] = useState<Stored | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const initial = useRef(JSON.stringify(initialContent ?? null)); // conteúdo de quando o editor abriu

  useEffect(() => {
    if (!draftKey) return;
    prune();
    const stored = read(draftKey);
    if (stored && JSON.stringify(stored.content) !== initial.current) setRestorable(stored);
    return () => clearTimeout(timer.current);
  }, [draftKey]);

  /** Chame a cada edição: grava depois de 1,5 s sem mexer. */
  const schedule = useCallback((content: EmailContent) => {
    if (!draftKey) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => write(draftKey, { content, savedAt: Date.now() }), SAVE_DELAY_MS);
  }, [draftKey]);

  const discard = useCallback(() => { clearTimeout(timer.current); if (draftKey) write(draftKey, null); setRestorable(null); }, [draftKey]);

  return { restorable, schedule, discard };
}
