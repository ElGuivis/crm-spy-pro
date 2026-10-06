import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTokens } from "@/contexts/TokenContext";
import { useToast } from "@/hooks/use-toast";
import { sendCatalogInChunks, type CatalogSendResult, type Item } from "@/components/catalogo/sendCatalogChunks";
import { CatalogSendPopup } from "@/components/catalogo/CatalogSendPopup";

export interface CatalogSendJob {
  /** corpo comum das chamadas (tenant, integração, telefone, opções) */
  base: Record<string, unknown>;
  products: (Item & Record<string, unknown>)[];
  collage: boolean;
  /** para quem está indo (aparece no popup) */
  label: string;
  /** chamado ao fim de cada rodada (inclusive reenvio) com o que de fato saiu */
  onDone?: (delivered: Item[], result: CatalogSendResult) => void;
}

export interface CatalogSendState {
  phase: "running" | "done";
  total: number;
  sent: number;
  label: string;
  stopping: boolean;
  result: CatalogSendResult | null;
  error: string | null;
}

interface Ctx {
  state: CatalogSendState | null;
  running: boolean;
  start: (job: CatalogSendJob) => boolean;
  stop: () => void;
  retry: () => void;
  dismiss: () => void;
}

const CatalogSendContext = createContext<Ctx | null>(null);

export function CatalogSendProvider({ children }: { children: ReactNode }) {
  const { refetchBalance } = useTokens();
  const { toast } = useToast();
  const [state, setState] = useState<CatalogSendState | null>(null);
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const jobRef = useRef<CatalogSendJob | null>(null);

  const run = useCallback(async (job: CatalogSendJob) => {
    runningRef.current = true; stopRef.current = false; jobRef.current = job;
    setState({ phase: "running", total: job.products.length, sent: 0, label: job.label, stopping: false, result: null, error: null });
    try {
      const result = await sendCatalogInChunks(job.base, job.products, job.collage, {
        shouldStop: () => stopRef.current,
        onProgress: (sent) => setState((s) => (s ? { ...s, sent } : s)),
      });
      const pending = new Set(result.pending.map((p) => String(p.id)));
      job.onDone?.(job.products.filter((p) => !pending.has(String(p.id))), result);
      jobRef.current = { ...job, products: result.pending as CatalogSendJob["products"] };
      setState((s) => (s ? { ...s, phase: "done", sent: result.sent, result, stopping: false } : s));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível enviar.";
      setState((s) => (s ? { ...s, phase: "done", stopping: false, error: message, result: { sent: 0, failed: job.products.length, images_sent: 0, token_cost: 0, pending: job.products, stopped: false } } : s));
      toast({ title: "Erro ao enviar o catálogo", description: message, variant: "destructive" });
    } finally {
      runningRef.current = false;
      await refetchBalance();
    }
  }, [refetchBalance, toast]);

  const start = useCallback((job: CatalogSendJob) => {
    if (runningRef.current) {
      toast({ title: "Já existe um envio em andamento", description: "Espere terminar ou interrompa o envio atual.", variant: "destructive" });
      return false;
    }
    void run(job);
    return true;
  }, [run, toast]);

  const stop = useCallback(() => { stopRef.current = true; setState((s) => (s ? { ...s, stopping: true } : s)); }, []);
  const retry = useCallback(() => { const j = jobRef.current; if (j && j.products.length && !runningRef.current) void run(j); }, [run]);
  const dismiss = useCallback(() => { if (!runningRef.current) { setState(null); jobRef.current = null; } }, []);

  // Fechar a aba no meio do envio deixaria produtos sem enviar
  const running = state?.phase === "running";
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const value = useMemo(() => ({ state, running: !!running, start, stop, retry, dismiss }), [state, running, start, stop, retry, dismiss]);
  return (
    <CatalogSendContext.Provider value={value}>
      {children}
      <CatalogSendPopup state={state} onStop={stop} onRetry={retry} onClose={dismiss} />
    </CatalogSendContext.Provider>
  );
}

export function useCatalogSend(): Ctx {
  const ctx = useContext(CatalogSendContext);
  if (!ctx) throw new Error("useCatalogSend precisa estar dentro de CatalogSendProvider");
  return ctx;
}
