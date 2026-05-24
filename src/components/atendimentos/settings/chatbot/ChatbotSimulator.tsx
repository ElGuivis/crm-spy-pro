import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Play, Send, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ChatbotConfig, MenuButton, KeywordRule } from "@/hooks/useChatbotBuilder";

interface SimMessage {
  id: string;
  role: 'user' | 'bot' | 'system';
  content: string;
}

interface Props {
  chatbot: ChatbotConfig;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ChatbotSimulator({ chatbot, open, onOpenChange }: Props) {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<'welcome' | 'menu' | 'keyword' | 'order' | 'transfer'>('welcome');

  const addMsg = useCallback((role: SimMessage['role'], content: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, content }]);
  }, []);

  const startSimulation = useCallback(() => {
    setMessages([]);
    setStage('welcome');
    if (chatbot.welcome_message) {
      setTimeout(() => {
        setMessages([{ id: crypto.randomUUID(), role: 'bot', content: chatbot.welcome_message || '' }]);
      }, 300);
    }
  }, [chatbot]);

  const handleUserSend = useCallback(() => {
    if (!input.trim()) return;
    const userMsg = input.trim().toLowerCase();
    addMsg('user', input.trim());
    setInput('');

    const transferKws = chatbot.transfer_keywords || [];
    if (transferKws.some(kw => userMsg.includes(kw.toLowerCase()))) {
      setTimeout(() => {
        addMsg('system', '🔄 Transferindo para atendente humano...');
        setStage('transfer');
      }, 500);
      return;
    }

    const rules = (chatbot.keyword_action_rules as KeywordRule[]) || [];
    for (const rule of rules) {
      if (rule.keywords.some(kw => userMsg.includes(kw.toLowerCase()))) {
        setTimeout(() => {
          if (rule.action === 'respond' && rule.response) addMsg('bot', rule.response);
          else addMsg('system', '🔄 Transferindo...');
        }, 500);
        return;
      }
    }

    const buttons = (chatbot.interactive_buttons as MenuButton[]) || [];
    const matchedBtn = buttons.find((btn, i) =>
      userMsg === String(i + 1) || userMsg.includes(btn.text.toLowerCase().replace(/[^\w\s]/g, '').trim())
    );

    if (matchedBtn) {
      setTimeout(() => {
        if (matchedBtn.action === 'respond' && matchedBtn.response) {
          addMsg('bot', matchedBtn.response);
        } else if (matchedBtn.action === 'order_lookup') {
          addMsg('bot', chatbot.order_verification_enabled
            ? `Por favor, informe seu ${chatbot.order_verification_mode === 'cpf' ? 'CPF' : chatbot.order_verification_mode === 'email' ? 'e-mail' : 'telefone'} para buscar seu pedido.`
            : '📦 Buscando seus pedidos...');
          setStage('order');
        } else if (matchedBtn.action === 'transfer_human') {
          addMsg('system', '🔄 Transferindo para atendente humano...');
          setStage('transfer');
        }
      }, 500);
      return;
    }

    setTimeout(() => {
      addMsg('bot', 'Desculpe, não entendi. Por favor, escolha uma das opções do menu.');
      if (chatbot.welcome_message) {
        setTimeout(() => addMsg('bot', chatbot.welcome_message || ''), 300);
      }
    }, 500);
  }, [input, chatbot, addMsg]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md h-[500px] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b shrink-0">
          <DialogTitle className="text-sm flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" />
            Teste do Chatbot: {chatbot.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Simule uma conversa para testar o fluxo configurado
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 py-2">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <Bot className="h-10 w-10 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">Clique "Iniciar" para testar o fluxo</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={startSimulation}>
                <Play className="h-3.5 w-3.5" />
                Iniciar simulação
              </Button>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <AnimatePresence>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex gap-2", msg.role === 'user' ? 'justify-end' : 'justify-start')}
                  >
                    {msg.role === 'system' ? (
                      <div className="flex items-center gap-1.5 mx-auto text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                        <AlertTriangle className="h-3 w-3" />
                        {msg.content}
                      </div>
                    ) : (
                      <div className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                        msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                      )}>
                        <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </ScrollArea>

        <div className="border-t p-3 flex gap-2 shrink-0">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={startSimulation} title="Reiniciar">
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Simule uma mensagem do cliente..."
            className="h-9 text-sm"
            disabled={stage === 'transfer'}
            onKeyDown={(e) => e.key === 'Enter' && handleUserSend()}
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleUserSend} disabled={!input.trim() || stage === 'transfer'}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
