import { useCallback, useRef, useState } from "react";

const MAX_STEPS = 100;
const COALESCE_MS = 800; // digitar num campo vira UM passo de desfazer, não um por letra

/** Histórico de desfazer/refazer. `commit(next, key)`: edições seguidas com a mesma `key` em menos de 0,8 s viram um passo só. */
export function useEditorHistory<T>(initial: T, onApply: (value: T) => void) {
  const [value, setValue] = useState<T>(initial);
  const valueRef = useRef(initial);
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const last = useRef<{ key: string; at: number } | null>(null);
  const [, bump] = useState(0);

  const apply = useCallback((next: T) => {
    valueRef.current = next;
    setValue(next);
    onApply(next);
    bump((n) => n + 1);
  }, [onApply]);

  const commit = useCallback((next: T, key?: string) => {
    const now = Date.now();
    const merge = !!key && last.current?.key === key && now - last.current.at < COALESCE_MS;
    if (!merge) {
      past.current.push(valueRef.current);
      if (past.current.length > MAX_STEPS) past.current.shift();
    }
    last.current = key ? { key, at: now } : null;
    future.current = [];
    apply(next);
  }, [apply]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(valueRef.current);
    last.current = null;
    apply(prev);
  }, [apply]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(valueRef.current);
    last.current = null;
    apply(next);
  }, [apply]);

  return { value, valueRef, commit, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
