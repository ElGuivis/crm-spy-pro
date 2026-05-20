import { useEffect, useRef, useMemo, useState, useCallback, forwardRef } from "react";
import { useMessages, useSendMessage, Conversation } from "@/hooks/useAtendimentos";
import { MessageBubble } from "./MessageBubble";
import { ChatComposer } from "./ChatComposer";
import { HandoffControls } from "./HandoffControls";
import { TemplatePicker } from "./TemplatePicker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConversationSummary } from "./ConversationSummary";
import { useConversationAI } from "@/hooks/useConversationAI";
import { Input } from "@/components/ui/input";
import { MessageSquare, User, WifiOff, PanelRightOpen, PanelRightClose, AlertTriangle, Phone, ArrowLeft, Search, X, ChevronUp, ChevronDown, Brain, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ChatWindowProps {
  conversationId: string | null;
  conversation?: Conversation | null;
  channelStatus?: 'connected' | 'disconnected' | null;
  channelProvider?: 'evolution' | 'meta' | null;
  channelWabaId?: string | null;
  channelPhoneNumberId?: string | null;
  integrationId?: string | null;
  onTogglePanel?: () => void;
  isPanelOpen?: boolean;
  onBack?: () => void;
}

export const ChatWindow = forwardRef<HTMLDivElement, ChatWindowProps>(function ChatWindow({ conversationId, conversation, channelStatus, channelProvider, channelWabaId, channelPhoneNumberId, integrationId, onTogglePanel, isPanelOpen, onBack }: ChatWindowProps, ref) {
  const { messages, isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => { setTriageDismissed(false); }, [conversationId]);

  // Ctrl+F to search in conversation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && conversationId) {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [conversationId, showSearch]);

  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return messages
      .map((m, i) => ({ index: i, id: m.id }))
      .filter(({ index }) => messages[index].content.toLowerCase().includes(query));
  }, [messages, searchQuery]);

  const navigateMatch = useCallback((direction: 'prev' | 'next') => {
    if (searchMatches.length === 0) return;
    setSearchMatchIndex(prev => {
      const next = direction === 'next'
        ? (prev + 1) % searchMatches.length
        : (prev - 1 + searchMatches.length) % searchMatches.length;
      const msgId = searchMatches[next]?.id;
      if (msgId) {
        document.getElementById(`msg-${msgId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return next;
    });
  }, [searchMatches]);

  const { intent, sentiment } = useConversationAI(conversationId);
  const [triageDismissed, setTriageDismissed] = useState(false);

  const INTENT_LABEL: Record<string, string> = { compra: 'Compra', suporte: 'Suporte', reclamacao: 'Reclamação', outro: 'Outro' };
  const INTENT_CLASS: Record<string, string> = {
    compra: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400',
    suporte: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400',
    reclamacao: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/20 dark:text-orange-400',
    outro: 'bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800/40 dark:text-gray-400',
  };

  const isMetaOutsideWindow = useMemo(() => {
    if (channelProvider !== 'meta' || !conversation) return false;
    const lastInbound = (conversation as any).last_inbound_at;
    if (!lastInbound) return true;
    const diff = Date.now() - new Date(lastInbound).getTime();
    return diff > 24 * 60 * 60 * 1000;
  }, [channelProvider, conversation]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Selecione uma conversa para começar</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Use Ctrl+K para buscar conversas</p>
        </motion.div>
      </div>
    );
  }

  const handleSend = (content: string, direction: string) => {
    sendMessage.mutate({ conversationId, content, direction });
  };

  const isOffline = channelStatus === 'disconnected';
  const contact = conversation?.contact;
  const currentMatchId = searchMatches[searchMatchIndex]?.id;

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      {conversation && (
        <div className="border-b px-3 md:px-4 py-2 flex items-center gap-2 md:gap-3 bg-card shrink-0">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {(contact?.name || contact?.phone || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">
              {contact?.name || contact?.phone || 'Desconhecido'}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              <span>{contact?.phone || '—'}</span>
            </div>
          </div>

          {intent && (
            <Badge variant="outline" className={cn("gap-1 text-xs", INTENT_CLASS[intent])}>
              <Brain className="h-3 w-3" />
              {INTENT_LABEL[intent]}
            </Badge>
          )}

          {isOffline && (
            <Badge variant="destructive" className="gap-1 text-xs">
              <WifiOff className="h-3 w-3" />
              Offline
            </Badge>
          )}

          {isMetaOutsideWindow && (
            <Badge variant="outline" className="gap-1 text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              24h expirada
            </Badge>
          )}

          <HandoffControls conversation={conversation} />
          <ConversationSummary conversationId={conversationId!} />

          {isMetaOutsideWindow && (
            <TemplatePicker
              wabaId={channelWabaId || null}
              phoneNumberId={channelPhoneNumberId || null}
              toPhone={contact?.phone || ''}
              conversationId={conversationId!}
            />
          )}

          {/* Search toggle */}
          <Button
            variant={showSearch ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => { setShowSearch(!showSearch); if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100); }}
            title="Buscar mensagens (Ctrl+F)"
          >
            <Search className="h-4 w-4" />
          </Button>

          {onTogglePanel && (
            <Button
              variant={isPanelOpen ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={onTogglePanel}
              title="Painel do cliente"
            >
              {isPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
          )}
        </div>
      )}

      {/* Search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="border-b bg-muted/30 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0); }}
                placeholder="Buscar nesta conversa..."
                className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-0"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigateMatch(e.shiftKey ? 'prev' : 'next');
                }}
              />
              {searchQuery && (
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {searchMatches.length > 0
                    ? `${searchMatchIndex + 1}/${searchMatches.length}`
                    : '0 resultados'
                  }
                </span>
              )}
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigateMatch('prev')} disabled={searchMatches.length === 0}>
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigateMatch('next')} disabled={searchMatches.length === 0}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline warning */}
      {isOffline && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-1.5 text-xs text-destructive text-center">
          Canal desconectado. Mensagens serão enfileiradas.
        </div>
      )}

      {/* Triage warning: negative sentiment */}
      {sentiment === 'negative' && !triageDismissed && (
        <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 border-b border-orange-200 dark:border-orange-800 px-4 py-1.5 text-xs text-orange-700 dark:text-orange-400">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">Sentimento negativo detectado — este cliente pode precisar de atenção especial.</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-orange-500 hover:text-orange-700" onClick={() => setTriageDismissed(true)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 px-4 py-2">
        {isLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <div className={cn("rounded-xl animate-pulse shimmer", i % 2 === 0 ? "w-48 h-12" : "w-36 h-10")} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma mensagem ainda</div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={cn(
                "transition-all duration-300",
                currentMatchId === msg.id && "bg-primary/10 rounded-lg -mx-1 px-1"
              )}
            >
              <MessageBubble message={msg} />
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </ScrollArea>

      {/* Composer */}
      <ChatComposer
        onSend={handleSend}
        disabled={sendMessage.isPending}
        contactName={contact?.name || undefined}
        channelProvider={channelProvider}
        channelWabaId={channelWabaId}
        channelPhoneNumberId={channelPhoneNumberId}
        conversationId={conversationId}
        contactPhone={contact?.phone || ''}
        integrationId={integrationId}
      />
    </div>
  );
});

ChatWindow.displayName = "ChatWindow";
