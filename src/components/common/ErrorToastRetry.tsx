import { toast } from "sonner";
import { AlertTriangle, RefreshCcw } from "lucide-react";

interface ErrorToastOptions {
  message?: string;
  onRetry?: () => void;
}

export function showErrorToast({ message = "Algo deu errado. Tente novamente.", onRetry }: ErrorToastOptions = {}) {
  toast.error(message, {
    duration: 6000,
    action: onRetry
      ? {
          label: "Tentar novamente",
          onClick: onRetry,
        }
      : undefined,
  });
}

/**
 * React Query error handler with retry toast.
 * Usage in hooks: onError: (e) => queryErrorHandler(e, () => refetch())
 */
export function queryErrorHandler(error: unknown, onRetry?: () => void) {
  const message =
    error instanceof Error ? error.message : "Erro ao carregar dados.";
  showErrorToast({ message, onRetry });
}
