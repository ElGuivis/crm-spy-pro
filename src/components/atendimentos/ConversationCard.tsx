import { cn } from "@/lib/utils";
import { Conversation } from "@/hooks/useAtendimentos";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, UserCheck, Brain, AlertCircle, Smile, Meh, Frown } from "lucide-react";

interface ConversationCardProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationCard({ conversation, isSelected, onClick }: ConversationCardProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || 'Desconhecido';
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false, locale: ptBR })
    : '';

  const initials = (displayName || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const isBot = conversation.ai_enabled && !conversation.handoff_mode && conversation.bot_state_json?.stage !== 'ai' && conversation.status !== 'closed';
  const isAI = conversation.ai_enabled && !conversation.handoff_mode && conversation.bot_state_json?.stage === 'ai' && conversation.status !== 'closed';
  const isClosed = conversation.status === 'closed';
  const isHandoff = conversation.handoff_mode;
  const isPending = conversation.status === 'pending';
  const isHighPriority = conversation.priority === 'high';
  const preview = conversation.last_message_preview;
  const sentiment = (conversation as any).sentiment as string | undefined;

  const SentimentIcon = sentiment === 'positive' ? Smile : sentiment === 'negative' ? Frown : null;
  const sentimentColor = sentiment === 'positive' 
    ? 'text-emerald-500' 
    : sentiment === 'negative' 
    ? 'text-red-500' 
    : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-2.5 py-2 rounded-lg transition-all duration-150",
        isSelected
          ? "bg-accent/80 shadow-sm"
          : "hover:bg-muted/60 active:scale-[0.99]",
        isHighPriority && !isSelected && "border-l-2 border-l-destructive"
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold relative",
          isBot ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
          isAI ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
          isHandoff ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
          "bg-primary/10 text-primary"
        )}>
          {initials}
          {/* Online/status indicator */}
          {isPending && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-yellow-500 border-2 border-card" />
          )}
          {!isPending && !isClosed && conversation.status === 'open' && (
            <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-card" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Name + time */}
          <div className="flex items-center justify-between gap-1">
            <span className={cn(
              "font-medium text-sm truncate",
              isSelected ? "text-foreground" : "text-foreground"
            )}>{displayName}</span>
            {timeAgo && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{timeAgo}</span>
            )}
          </div>

          {/* Preview */}
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {preview || contact?.phone || ''}
          </p>

          {/* Status badges */}
          <div className="flex items-center gap-1 mt-1">
            {isBot && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                <Bot className="h-2.5 w-2.5" />
                Bot
              </span>
            )}
            {isAI && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                <Brain className="h-2.5 w-2.5" />
                IA
              </span>
            )}
            {isHandoff && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                <UserCheck className="h-2.5 w-2.5" />
                Humano
              </span>
            )}
            {isClosed && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Fechado
              </span>
            )}
            {isHighPriority && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                <AlertCircle className="h-2.5 w-2.5" />
                Alta
              </span>
            )}
            {SentimentIcon && (
              <SentimentIcon className={cn("h-3 w-3 ml-auto", sentimentColor)} />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
