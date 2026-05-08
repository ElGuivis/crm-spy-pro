import { Conversation } from "@/hooks/useAtendimentos";
import {
  useToggleBot,
  useAssignConversation,
  useCloseConversation,
  useReopenConversation,
  useBlockContact,
} from "@/hooks/useConversationActions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Bot, UserCheck, XCircle, RotateCcw, Ban, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

interface HandoffControlsProps {
  conversation: Conversation;
}

export function HandoffControls({ conversation }: HandoffControlsProps) {
  const toggleBot = useToggleBot();
  const assignConversation = useAssignConversation();
  const closeConversation = useCloseConversation();
  const reopenConversation = useReopenConversation();
  const blockContact = useBlockContact();

  const isBotActive = (conversation as any).ai_enabled !== false && conversation.status === 'bot';
  const isClosed = conversation.status === 'closed';
  const isAssigned = !!conversation.assigned_to;

  const loading =
    toggleBot.isPending ||
    assignConversation.isPending ||
    closeConversation.isPending ||
    reopenConversation.isPending ||
    blockContact.isPending;

  return (
    <div className="flex items-center gap-1.5">
      {/* Toggle bot */}
      <Button
        variant={isBotActive ? "secondary" : "outline"}
        size="sm"
        className={cn("h-7 text-xs gap-1", isBotActive && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400")}
        onClick={() =>
          toggleBot.mutate({
            conversationId: conversation.id,
            currentlyEnabled: isBotActive,
          })
        }
        disabled={loading || isClosed}
        title={isBotActive ? "Pausar bot" : "Reativar bot"}
      >
        <Bot className="h-3.5 w-3.5" />
        {isBotActive ? "Bot ativo" : "Bot off"}
      </Button>

      {/* Assume conversation */}
      {!isAssigned && !isClosed && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => assignConversation.mutate({ conversationId: conversation.id })}
          disabled={loading}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Assumir
        </Button>
      )}

      {/* Close / Reopen */}
      {isClosed ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => reopenConversation.mutate({ conversationId: conversation.id })}
          disabled={loading}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reabrir
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => closeConversation.mutate({ conversationId: conversation.id })}
          disabled={loading}
        >
          <XCircle className="h-3.5 w-3.5" />
          Encerrar
        </Button>
      )}

      {/* More menu with block */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={loading}>
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isAssigned && !isClosed && (
            <DropdownMenuItem
              onClick={() =>
                toggleBot.mutate({ conversationId: conversation.id, currentlyEnabled: false })
              }
            >
              <Bot className="h-4 w-4 mr-2" />
              Devolver ao bot
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
              >
                <Ban className="h-4 w-4 mr-2" />
                Bloquear contato
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bloquear contato?</AlertDialogTitle>
                <AlertDialogDescription>
                  O contato não poderá mais enviar mensagens. A conversa será encerrada.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    blockContact.mutate({
                      conversationId: conversation.id,
                      phone: conversation.contact?.phone || '',
                    })
                  }
                >
                  Bloquear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
