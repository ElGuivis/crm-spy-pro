import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, ChevronDown, ChevronUp, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

import { createLogger } from '@/lib/logger';
const log = createLogger('ConversationSummary');

interface ConversationSummaryProps {
  conversationId: string;
}

export function ConversationSummary({ conversationId }: ConversationSummaryProps) {
  const { tenantId } = useAuth();
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSummarize = async () => {
    if (summary) {
      setIsExpanded(!isExpanded);
      return;
    }

    if (!tenantId) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-assist', {
        body: { action: 'summarize', conversation_id: conversationId, tenant_id: tenantId },
      });

      if (error) throw error;
      if (data?.error === 'no_ai_provider') {
        toast.error('Configure um provedor de IA nas Integrações.');
        return;
      }

      setSummary(data?.result || 'Não foi possível gerar o resumo.');
      setIsExpanded(true);
    } catch (err) {
      log.error('Error summarizing:', err);
      toast.error('Erro ao gerar resumo');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSummarize}
        disabled={isLoading}
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <FileText className="h-3 w-3" />
        )}
        {summary ? (isExpanded ? 'Ocultar resumo' : 'Ver resumo') : 'Resumir conversa'}
        {summary && (isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </Button>

      <AnimatePresence>
        {isExpanded && summary && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 mx-2 mb-1 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
