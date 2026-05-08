import { cn } from "@/lib/utils";
import { Message } from "@/hooks/useAtendimentos";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, AlertCircle, StickyNote } from "lucide-react";

interface MessageBubbleProps {
  message: Message;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'queued': return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'sent': return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered': return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case 'read': return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'failed': return <AlertCircle className="h-3 w-3 text-destructive" />;
    default: return null;
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  // Use sender_type as fallback for legacy messages where direction defaults to 'inbound'
  const isOutbound = message.direction === 'outbound' || 
    (message.direction === 'inbound' && (message.sender_type === 'agent' || message.sender_type === 'bot'));
  const isNote = message.direction === 'internal_note';
  const isSystem = message.direction === 'system' || message.sender_type === 'system';
  const time = format(new Date(message.created_at), 'HH:mm');

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  if (isNote) {
    return (
      <div className="flex justify-end my-1">
        <div className="max-w-[75%] rounded-lg px-3 py-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
          <div className="flex items-center gap-1 mb-0.5">
            <StickyNote className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-400">Nota interna</span>
          </div>
          <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
          <span className="text-xs text-muted-foreground mt-1 block text-right">{time}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex my-1", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2",
          isOutbound
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <div className={cn("flex items-center gap-1 mt-1", isOutbound ? "justify-end" : "justify-start")}>
          <span className={cn("text-xs", isOutbound ? "text-primary-foreground/70" : "text-muted-foreground")}>{time}</span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}
