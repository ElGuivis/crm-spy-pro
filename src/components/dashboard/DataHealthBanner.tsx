import { AlertTriangle } from 'lucide-react';

/** Aviso no topo do dashboard quando algum dado pode estar velho, divergente ou não carregou. */
export function DataHealthBanner({ problems, loadFailed }: { problems: string[]; loadFailed: boolean }) {
  const all = [...(loadFailed ? ['Alguns números do painel não carregaram; os valores exibidos podem estar incompletos. Recarregue a página.'] : []), ...problems];
  if (all.length === 0) return null;
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-foreground">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
      <ul className="space-y-0.5">{all.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}
