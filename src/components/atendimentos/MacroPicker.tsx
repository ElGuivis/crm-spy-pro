import { useState, useRef, useCallback } from "react";
import { useQuickReplies, QuickReply } from "@/hooks/useQuickReplies";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Star, Search } from "lucide-react";

interface MacroPickerProps {
  onSelect: (content: string) => void;
  contactName?: string;
}

export function MacroPicker({ onSelect, contactName }: MacroPickerProps) {
  const { quickReplies, isLoading } = useQuickReplies();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = quickReplies.filter(qr =>
    !search ||
    qr.title.toLowerCase().includes(search.toLowerCase()) ||
    qr.content.toLowerCase().includes(search.toLowerCase()) ||
    (qr.shortcut && qr.shortcut.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelect = useCallback((qr: QuickReply) => {
    let content = qr.content;
    // Replace variables
    if (contactName) {
      content = content.replace(/{nome}/gi, contactName);
    }
    content = content.replace(/{data}/gi, new Date().toLocaleDateString('pt-BR'));
    onSelect(content);
    setOpen(false);
    setSearch('');
  }, [onSelect, contactName]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          title="Respostas rápidas"
        >
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar resposta rápida..."
              className="h-7 text-xs pl-7"
            />
          </div>
        </div>
        <ScrollArea className="max-h-60">
          {isLoading ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Nenhuma resposta rápida</p>
          ) : (
            <div className="p-1">
              {filtered.map(qr => (
                <button
                  key={qr.id}
                  className="w-full text-left px-2.5 py-2 rounded hover:bg-accent transition-colors"
                  onClick={() => handleSelect(qr)}
                >
                  <div className="flex items-center gap-1.5">
                    {qr.is_favorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    <span className="text-xs font-medium text-foreground">{qr.title}</span>
                    {qr.shortcut && (
                      <span className="text-[10px] text-muted-foreground ml-auto">/{qr.shortcut}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{qr.content}</p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
