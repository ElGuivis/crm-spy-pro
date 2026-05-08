import { useState, useRef, useCallback, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, StickyNote, Paperclip, ShoppingBag, Keyboard, Sparkles, Loader2, Languages } from "lucide-react";
import { MacroPicker } from "./MacroPicker";
import { TemplatePicker } from "./TemplatePicker";
import { CatalogPickerDialog } from "./CatalogPickerDialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

import { createLogger } from '@/lib/logger';
const log = createLogger('ChatComposer');

interface ChatComposerProps {
  onSend: (content: string, direction: string) => void;
  disabled?: boolean;
  contactName?: string;
  channelProvider?: 'evolution' | 'meta' | null;
  channelWabaId?: string | null;
  channelPhoneNumberId?: string | null;
  conversationId?: string | null;
  contactPhone?: string;
  integrationId?: string | null;
}

export function ChatComposer({ onSend, disabled, contactName, channelProvider, channelWabaId, channelPhoneNumberId, conversationId, contactPhone, integrationId }: ChatComposerProps) {
  const { tenantId } = useAuth();
  const [text, setText] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleAISuggest = useCallback(async () => {
    if (!conversationId || !tenantId) return;
    setIsSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assist', {
        body: { action: 'suggest', conversation_id: conversationId, tenant_id: tenantId },
      });
      if (error) throw error;
      if (data?.error === 'no_ai_provider') {
        toast.error('Configure um provedor de IA nas Integrações.');
        return;
      }
      if (data?.result) {
        setText(data.result);
        textareaRef.current?.focus();
        toast.success('Sugestão gerada pela IA');
      }
    } catch (err) {
      log.error('AI suggest error:', err);
      toast.error('Erro ao gerar sugestão');
    } finally {
      setIsSuggesting(false);
    }
  }, [conversationId, tenantId]);

  const handleTranslate = useCallback(async () => {
    if (!conversationId || !tenantId) return;
    setIsTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assist', {
        body: { action: 'translate', conversation_id: conversationId, tenant_id: tenantId },
      });
      if (error) throw error;
      if (data?.error === 'no_ai_provider') {
        toast.error('Configure um provedor de IA nas Integrações.');
        return;
      }
      if (data?.result) {
        toast.info(`Tradução: ${data.result}`);
      }
    } catch (err) {
      log.error('Translate error:', err);
      toast.error('Erro ao traduzir');
    } finally {
      setIsTranslating(false);
    }
  }, [conversationId, tenantId]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, isNote ? 'internal_note' : 'outbound');
    setText('');
    textareaRef.current?.focus();
  }, [text, isNote, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Escape to clear / toggle note
    if (e.key === 'Escape') {
      if (text.trim()) {
        setText('');
      } else if (isNote) {
        setIsNote(false);
      }
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // '/' to focus composer (when not already focused)
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      // Ctrl+Shift+N to toggle note mode
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        setIsNote(prev => !prev);
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleMacroSelect = useCallback((content: string) => {
    setText(content);
    textareaRef.current?.focus();
  }, []);

  // Drag & drop file handling
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0]; // Handle first file
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (file.size > maxSize) {
      toast.error('Arquivo muito grande (máx. 10MB)');
      return;
    }

    // For now, show a toast that file upload is coming soon
    toast.info(`📎 Envio de arquivos em breve! (${file.name})`);
  }, []);

  const showMetaTemplates = channelProvider === 'meta' && channelWabaId;

  return (
    <div
      ref={dropZoneRef}
      className={cn("border-t bg-card relative transition-colors", isDragOver && "bg-primary/5 border-primary/30")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg z-10 pointer-events-none">
          <div className="flex items-center gap-2 text-primary text-sm font-medium">
            <Paperclip className="h-5 w-5" />
            Solte o arquivo aqui
          </div>
        </div>
      )}

      {/* Note indicator */}
      {isNote && (
        <div className="flex items-center gap-1.5 px-3 pt-2 text-amber-600 dark:text-amber-400">
          <StickyNote className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Nota interna — não será enviada ao cliente</span>
          <span className="text-[10px] text-muted-foreground ml-auto">Ctrl+Shift+N</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 pt-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setIsNote(!isNote)}
              className={cn(
                "h-7 w-7",
                isNote && "text-amber-600 bg-amber-100 dark:bg-amber-900/30"
              )}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">{isNote ? "Voltar para mensagem (Ctrl+Shift+N)" : "Nota interna (Ctrl+Shift+N)"}</TooltipContent>
        </Tooltip>

        <MacroPicker onSelect={handleMacroSelect} contactName={contactName} />

        {showMetaTemplates && conversationId && (
          <TemplatePicker
            wabaId={channelWabaId || null}
            phoneNumberId={channelPhoneNumberId || null}
            toPhone={contactPhone || ''}
            conversationId={conversationId}
          />
        )}

        {integrationId && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCatalog(true)}>
                <ShoppingBag className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Catálogo de produtos</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Anexar arquivo (em breve)</TooltipContent>
        </Tooltip>

        {/* AI divider */}
        <div className="w-px h-4 bg-border mx-0.5" />

        {/* AI Suggest */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", isSuggesting && "text-primary")}
              onClick={handleAISuggest}
              disabled={isSuggesting || !conversationId}
            >
              {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Sugerir resposta com IA</TooltipContent>
        </Tooltip>

        {/* Translate */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleTranslate}
              disabled={isTranslating || !conversationId}
            >
              {isTranslating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Traduzir última mensagem</TooltipContent>
        </Tooltip>

        {/* Keyboard shortcut hint */}
        <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <Keyboard className="h-3 w-3" />
          <span>/</span>
        </div>
      </div>

      {/* Input area */}
      <div className="flex gap-2 items-end px-3 pb-3 pt-1">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isNote ? "Escreva uma nota interna... (Esc para cancelar)" : "Digite uma mensagem... (/ para focar)"}
          disabled={disabled}
          className={cn(
            "min-h-[40px] max-h-[120px] resize-none text-sm transition-colors",
            isNote && "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
          )}
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className={cn("shrink-0 h-9 w-9 transition-all", text.trim() && "shadow-sm")}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Catalog Picker */}
      {integrationId && conversationId && (
        <CatalogPickerDialog
          open={showCatalog}
          onOpenChange={setShowCatalog}
          integrationId={integrationId}
          contactPhone={contactPhone || ''}
          conversationId={conversationId}
          onSendNote={(note) => onSend(note, 'internal_note')}
        />
      )}
    </div>
  );
}
