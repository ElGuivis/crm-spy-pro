import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ShoppingCart, Users, MessageSquare, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

import { createLogger } from '@/lib/logger';
const log = createLogger('GlobalSearch');

interface SearchResult {
  id: string;
  type: 'client' | 'order' | 'conversation';
  title: string;
  subtitle: string;
  link: string;
}

const TYPE_CONFIG = {
  client: { icon: Users, label: 'Cliente', color: 'text-primary' },
  order: { icon: ShoppingCart, label: 'Pedido', color: 'text-info' },
  conversation: { icon: MessageSquare, label: 'Conversa', color: 'text-whatsapp' },
};

export function GlobalSearch() {
  const { tenant } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!tenant?.id || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const searchResults: SearchResult[] = [];
      const term = `%${q}%`;

      // Search LI customers
      const { data: liClients } = await supabase
        .from('li_customers')
        .select('id, name, email')
        .eq('tenant_id', tenant.id)
        .or(`name.ilike.${term},email.ilike.${term}`)
        .limit(5);
      liClients?.forEach(c => searchResults.push({
        id: c.id, type: 'client', title: c.name || 'Sem nome',
        subtitle: c.email || '', link: '/clients',
      }));

      // Search Bling customers
      const { data: blingClients } = await supabase
        .from('bling_customers')
        .select('id, nome, email')
        .eq('tenant_id', tenant.id)
        .or(`nome.ilike.${term},email.ilike.${term}`)
        .limit(5);
      blingClients?.forEach(c => searchResults.push({
        id: c.id, type: 'client', title: c.nome || 'Sem nome',
        subtitle: c.email || '', link: '/clients',
      }));

      // Search LI orders by order_number
      const { data: liOrders } = await supabase
        .from('li_orders')
        .select('id, order_number, status_name')
        .eq('tenant_id', tenant.id)
        .ilike('order_number', term)
        .limit(5);
      liOrders?.forEach(o => searchResults.push({
        id: o.id, type: 'order', title: `Pedido #${o.order_number}`,
        subtitle: o.status_name || '', link: '/sales',
      }));

      // Search Bling orders
      const { data: blingOrders } = await supabase
        .from('bling_orders')
        .select('id, numero, cliente_nome')
        .eq('tenant_id', tenant.id)
        .or(`numero.ilike.${term},cliente_nome.ilike.${term}`)
        .limit(5);
      blingOrders?.forEach(o => searchResults.push({
        id: o.id, type: 'order', title: `Pedido #${o.numero}`,
        subtitle: o.cliente_nome || '', link: '/sales',
      }));

      // Search contacts (used by conversations)
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('tenant_id', tenant.id)
        .or(`name.ilike.${term},phone.ilike.${term}`)
        .limit(5);
      contacts?.forEach(c => searchResults.push({
        id: c.id, type: 'conversation', title: c.name || c.phone || 'Conversa',
        subtitle: c.phone || '', link: '/atendimentos',
      }));

      setResults(searchResults.slice(0, 15));
      setSelectedIndex(0);
    } catch (err) {
      log.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    navigate(result.link);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center h-9 w-64 rounded-lg border border-input bg-background px-3 text-sm cursor-text transition-colors hover:border-primary/50"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
      >
        <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, pedidos..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            autoFocus
          />
        ) : (
          <span className="flex-1 text-muted-foreground">Buscar...</span>
        )}
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      {open && (query.length >= 2 || results.length > 0) && (
        <div className="absolute top-full mt-2 w-96 right-0 rounded-xl border border-border bg-popover shadow-xl z-50 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum resultado para "{query}"
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="max-h-80 overflow-y-auto py-1">
              {results.map((result, i) => {
                const config = TYPE_CONFIG[result.type];
                const Icon = config.icon;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-[10px] uppercase text-muted-foreground font-medium">{config.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
