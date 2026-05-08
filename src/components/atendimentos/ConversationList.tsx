import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useConversations, ConversationFilters, Conversation } from "@/hooks/useAtendimentos";
import { ConversationCard } from "./ConversationCard";
import { useTags } from "@/hooks/useTags";
import { Search, MessageSquare, Filter, X, Calendar, Tag, UserCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { motion, AnimatePresence } from "framer-motion";
import { SkeletonConversation } from "@/components/common/SkeletonConversation";

interface ConversationListProps {
  inboxId: string | null;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

const STATUS_TABS = [
  { key: 'pending', label: 'Pendentes' },
  { key: 'bot', label: 'Bot' },
  { key: 'ai', label: 'IA' },
  { key: 'open', label: 'Abertos' },
  { key: 'automation', label: 'Automações' },
  { key: 'closed', label: 'Fechados' },
  { key: 'all', label: 'Todos' },
] as const;

const PRIORITY_OPTIONS = [
  { key: 'all', label: 'Todas' },
  { key: 'high', label: '🔴 Alta' },
  { key: 'normal', label: '🟡 Normal' },
  { key: 'low', label: '🟢 Baixa' },
];

export function ConversationList({ inboxId, selectedConversationId, onSelectConversation }: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { tags } = useTags();

  const filters: ConversationFilters = {
    status: statusFilter,
    search: search || undefined,
    tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { conversations, isLoading } = useConversations(inboxId, filters);

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const isBotConv = (c: Conversation) =>
    c.ai_enabled && !c.handoff_mode && c.bot_state_json?.stage !== 'ai' && c.status !== 'closed';

  const isAIConv = (c: Conversation) =>
    c.ai_enabled && !c.handoff_mode && c.bot_state_json?.stage === 'ai' && c.status !== 'closed';

  const isAutomationConv = (c: Conversation) =>
    c.source === 'automation' && c.status !== 'closed';

  const counts = {
    all: conversations.length,
    open: conversations.filter(c => c.status === 'open' && c.source !== 'automation').length,
    pending: conversations.filter(c => c.status === 'pending').length,
    bot: conversations.filter(isBotConv).length,
    ai: conversations.filter(isAIConv).length,
    automation: conversations.filter(isAutomationConv).length,
    closed: conversations.filter(c => c.status === 'closed').length,
  };

  const filteredConversations = useMemo(() => {
    let result = statusFilter === 'all'
      ? conversations
      : statusFilter === 'bot'
      ? conversations.filter(isBotConv)
      : statusFilter === 'ai'
      ? conversations.filter(isAIConv)
      : statusFilter === 'automation'
      ? conversations.filter(isAutomationConv)
      : statusFilter === 'open'
      ? conversations.filter(c => c.status === 'open' && c.source !== 'automation')
      : conversations.filter(c => c.status === statusFilter);

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter(c => c.priority === priorityFilter);
    }

    return result;
  }, [conversations, statusFilter, priorityFilter]);

  const activeFilterCount = 
    (priorityFilter !== 'all' ? 1 : 0) +
    (selectedTagIds.length > 0 ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  const clearAllFilters = () => {
    setPriorityFilter('all');
    setSelectedTagIds([]);
    setDateFrom('');
    setDateTo('');
    setShowAdvancedFilters(false);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2.5 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Buscar nome, telefone, mensagem... (Ctrl+K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-16 h-9 text-sm"
          />
          <div className="absolute right-1 top-1 flex items-center gap-0.5">
            {search && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
            <Popover open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("h-7 w-7 relative", activeFilterCount > 0 && "text-primary")}>
                  <Filter className="h-3.5 w-3.5" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3 space-y-3">
                {/* Priority */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">Prioridade</p>
                  <div className="flex flex-wrap gap-1">
                    {PRIORITY_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setPriorityFilter(opt.key)}
                        className={cn(
                          "px-2 py-1 rounded text-xs font-medium transition-colors",
                          priorityFilter === opt.key
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                      <Tag className="h-3 w-3 inline mr-1" />
                      Tags
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {tags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTag(tag.id)}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium transition-all border",
                            selectedTagIds.includes(tag.id)
                              ? "border-current shadow-sm"
                              : "border-transparent opacity-70 hover:opacity-100"
                          )}
                          style={{
                            backgroundColor: tag.color + '20',
                            color: tag.color,
                            borderColor: selectedTagIds.includes(tag.id) ? tag.color : 'transparent',
                          }}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Date range */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5">
                    <Calendar className="h-3 w-3 inline mr-1" />
                    Período
                  </p>
                  <div className="flex gap-1.5">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-7 text-xs flex-1"
                      placeholder="De"
                    />
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-7 text-xs flex-1"
                      placeholder="Até"
                    />
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs h-7"
                    onClick={clearAllFilters}
                  >
                    Limpar todos os filtros
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b overflow-x-auto">
        {STATUS_TABS.map(tab => {
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-200",
                statusFilter === tab.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  "ml-1 text-[10px]",
                  statusFilter === tab.key ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active filter chips */}
      <AnimatePresence>
        {activeFilterCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b px-2 overflow-hidden"
          >
            <div className="flex items-center gap-1 py-1.5 flex-wrap">
              {priorityFilter !== 'all' && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => setPriorityFilter('all')}>
                  Prioridade: {PRIORITY_OPTIONS.find(p => p.key === priorityFilter)?.label}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
              {selectedTagIds.length > 0 && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => setSelectedTagIds([])}>
                  <Tag className="h-2.5 w-2.5" />
                  {selectedTagIds.length} tag{selectedTagIds.length > 1 ? 's' : ''}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
              {(dateFrom || dateTo) && (
                <Badge variant="secondary" className="text-[10px] h-5 gap-1 cursor-pointer hover:bg-destructive/10" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  <Calendar className="h-2.5 w-2.5" />
                  {dateFrom || '...'} → {dateTo || '...'}
                  <X className="h-2.5 w-2.5" />
                </Badge>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {isLoading ? (
            <SkeletonConversation count={6} />
          ) : filteredConversations.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8 text-muted-foreground"
            >
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                {search ? `Nenhum resultado para "${search}"` : 'Nenhuma conversa encontrada'}
              </p>
              {(search || activeFilterCount > 0) && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => { setSearch(''); clearAllFilters(); }}>
                  Limpar busca e filtros
                </Button>
              )}
            </motion.div>
          ) : (
            filteredConversations.map((conv, index) => (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.2) }}
              >
                <ConversationCard
                  conversation={conv}
                  isSelected={conv.id === selectedConversationId}
                  onClick={() => onSelectConversation(conv.id)}
                />
              </motion.div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
