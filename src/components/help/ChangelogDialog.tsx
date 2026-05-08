import { useState } from 'react';
import { Sparkles, Bug, Zap, Star, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ChangelogEntry {
  version: string;
  date: string;
  items: {
    type: 'feature' | 'improvement' | 'fix';
    text: string;
  }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2.6.0',
    date: '08 Mar 2026',
    items: [
      { type: 'feature', text: 'Sons customizáveis para notificações (Padrão, Chime, Pop, Sino)' },
      { type: 'feature', text: 'Tour de onboarding com dicas contextuais e navegação por teclado' },
      { type: 'feature', text: 'Botão de atualizar no checklist de setup' },
      { type: 'improvement', text: 'Animações de transição melhoradas no tour' },
      { type: 'improvement', text: 'Busca no changelog para encontrar novidades rapidamente' },
    ],
  },
  {
    version: '2.5.0',
    date: '08 Mar 2026',
    items: [
      { type: 'feature', text: 'Dashboard de Atendimento com P50/P90, SLA e volume por hora' },
      { type: 'feature', text: 'Export PDF e CSV em todos os relatórios' },
      { type: 'improvement', text: 'Gráficos Recharts nos relatórios de conversas' },
      { type: 'improvement', text: 'Performance por atendente com tempo de resposta' },
    ],
  },
  {
    version: '2.4.0',
    date: '07 Mar 2026',
    items: [
      { type: 'feature', text: 'Simulador de chatbot para teste de fluxos' },
      { type: 'feature', text: 'Wizard de automação com templates prontos' },
      { type: 'improvement', text: 'Preview de variáveis dinâmicas em automações' },
    ],
  },
  {
    version: '2.3.0',
    date: '06 Mar 2026',
    items: [
      { type: 'feature', text: 'Busca global de conversas (Ctrl+K)' },
      { type: 'feature', text: 'Filtros avançados por status, tag, agente e data' },
      { type: 'feature', text: 'Notas internas fixadas no painel do contato' },
      { type: 'improvement', text: 'Atalho Ctrl+Shift+N para notas rápidas' },
    ],
  },
  {
    version: '2.2.0',
    date: '05 Mar 2026',
    items: [
      { type: 'feature', text: 'Transições com Framer Motion entre páginas' },
      { type: 'feature', text: 'Skeleton loaders em todas as listagens' },
      { type: 'improvement', text: 'Cache inteligente com React Query' },
      { type: 'improvement', text: 'Lazy loading de rotas pesadas' },
      { type: 'fix', text: 'Performance mobile otimizada' },
    ],
  },
];

const TYPE_CONFIG = {
  feature: { label: 'Novo', color: 'bg-primary/10 text-primary border-primary/20', icon: Star },
  improvement: { label: 'Melhoria', color: 'bg-chart-2/10 text-chart-2 border-chart-2/20', icon: Zap },
  fix: { label: 'Correção', color: 'bg-chart-4/10 text-chart-4 border-chart-4/20', icon: Bug },
};

const SEEN_KEY = 'spypro_changelog_seen';

export function ChangelogDialog({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      localStorage.setItem(SEEN_KEY, CHANGELOG[0].version);
      setSearch('');
    }
  };

  const hasUnseen = localStorage.getItem(SEEN_KEY) !== CHANGELOG[0].version;

  const filtered = search
    ? CHANGELOG.map(entry => ({
        ...entry,
        items: entry.items.filter(i => i.text.toLowerCase().includes(search.toLowerCase())),
      })).filter(e => e.items.length > 0)
    : CHANGELOG;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="relative gap-2 text-muted-foreground hover:text-foreground">
            <Sparkles className="h-4 w-4" />
            Novidades
            {hasUnseen && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Novidades do SpyPro
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar novidades..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum resultado encontrado.</p>
            )}
            {filtered.map((entry, i) => (
              <div key={entry.version} className={cn(i > 0 && "border-t border-border pt-5")}>
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="outline" className="font-mono text-xs">v{entry.version}</Badge>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                  {i === 0 && !search && (
                    <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">Mais recente</Badge>
                  )}
                </div>
                <ul className="space-y-2">
                  {entry.items.map((item, j) => {
                    const config = TYPE_CONFIG[item.type];
                    return (
                      <li key={j} className="flex items-start gap-2">
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0 mt-0.5", config.color)}>
                          {config.label}
                        </Badge>
                        <span className="text-sm text-foreground">{item.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
