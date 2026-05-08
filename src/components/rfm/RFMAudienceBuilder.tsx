import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useRFMAudiences, type AudienceRule, type RFMAudience } from '@/hooks/useRFMAudiences';
import { Users, Plus, Trash2, RefreshCw, Send, Loader2, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RFMAudienceBuilderProps {
  integrationId: string;
  allSegments: string[];
}

const SEGMENT_OPTIONS = [
  'Campeões', 'Fiéis', 'Novos Clientes', 'Promissores',
  'Alto Valor em Risco', 'Em Risco', 'Hibernando/Perdidos', 'Outros',
];

const CHURN_OPTIONS = [
  { value: 'saudavel', label: 'Saudável' },
  { value: 'atencao', label: 'Atenção' },
  { value: 'risco', label: 'Risco' },
  { value: 'critico', label: 'Crítico' },
];

export function RFMAudienceBuilder({ integrationId, allSegments }: RFMAudienceBuilderProps) {
  const {
    audiences, isLoading, createAudience, isCreating,
    deleteAudience, recalculateAudience, isRecalculating,
  } = useRFMAudiences(integrationId);
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState<AudienceRule>({});

  const handleCreate = () => {
    if (!name.trim()) return;
    createAudience({ name, description, rules }, {
      onSuccess: (data: any) => {
        // Auto-recalculate after creation
        if (data) {
          recalculateAudience(data as RFMAudience);
        }
        setDialogOpen(false);
        resetForm();
      },
    });
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setRules({});
  };

  const updateRule = (key: keyof AudienceRule, value: any) => {
    setRules(prev => {
      const next = { ...prev };
      if (value === '' || value === undefined || value === null) {
        delete next[key];
      } else {
        (next as any)[key] = key === 'segment_name' || key === 'churn_risk' ? value : Number(value);
      }
      return next;
    });
  };

  const activeRulesCount = Object.keys(rules).filter(k => (rules as any)[k] !== undefined).length;

  const handleExportToCampaign = (audience: RFMAudience) => {
    // Navigate to campaigns with audience context
    navigate(`/disparos?rfm_audience_id=${audience.id}&rfm_audience_name=${encodeURIComponent(audience.name)}`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5" />
          Audiências Dinâmicas
        </CardTitle>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova Audiência
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Carregando...</div>
        ) : audiences.length === 0 ? (
          <div className="text-center py-8">
            <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">Nenhuma audiência criada</p>
            <p className="text-xs text-muted-foreground">Crie filtros salvos como audiências para usar em campanhas de disparo.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {audiences.map((aud) => (
              <div
                key={aud.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-foreground truncate">{aud.name}</p>
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {aud.member_count}
                    </Badge>
                  </div>
                  {aud.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{aud.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>
                      Receita: R$ {Number(aud.total_revenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                    {aud.last_calculated_at && (
                      <span>
                        Atualizado: {format(new Date(aud.last_calculated_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => recalculateAudience(aud)}
                    disabled={isRecalculating}
                    title="Recalcular"
                  >
                    {isRecalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleExportToCampaign(aud)}
                    title="Criar campanha"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteAudience(aud.id)}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Audiência RFM</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Clientes VIP em risco"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                placeholder="Descrição opcional"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Regras de Filtro</Label>
                {activeRulesCount > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {activeRulesCount} {activeRulesCount === 1 ? 'filtro' : 'filtros'}
                  </Badge>
                )}
              </div>

              {/* Segment filter */}
              <div>
                <Label className="text-xs text-muted-foreground">Segmento</Label>
                <Select
                  value={rules.segment_name || ''}
                  onValueChange={(v) => updateRule('segment_name', v === '__none__' ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos os segmentos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todos os segmentos</SelectItem>
                    {SEGMENT_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Churn risk filter */}
              <div>
                <Label className="text-xs text-muted-foreground">Risco de Churn</Label>
                <Select
                  value={rules.churn_risk || ''}
                  onValueChange={(v) => updateRule('churn_risk', v === '__none__' ? undefined : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Todos</SelectItem>
                    {CHURN_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* RFM Score ranges */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">R mín</Label>
                  <Input
                    type="number" min={1} max={5} className="h-8 text-xs"
                    value={rules.r_min || ''}
                    onChange={(e) => updateRule('r_min', e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">F mín</Label>
                  <Input
                    type="number" min={1} max={5} className="h-8 text-xs"
                    value={rules.f_min || ''}
                    onChange={(e) => updateRule('f_min', e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">M mín</Label>
                  <Input
                    type="number" min={1} max={5} className="h-8 text-xs"
                    value={rules.m_min || ''}
                    onChange={(e) => updateRule('m_min', e.target.value)}
                    placeholder="1"
                  />
                </div>
              </div>

              {/* Revenue / Orders / AOV */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Receita mín (R$)</Label>
                  <Input
                    type="number" className="h-8 text-xs"
                    value={rules.min_revenue || ''}
                    onChange={(e) => updateRule('min_revenue', e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pedidos mín</Label>
                  <Input
                    type="number" className="h-8 text-xs"
                    value={rules.min_orders || ''}
                    onChange={(e) => updateRule('min_orders', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Ticket médio mín (R$)</Label>
                <Input
                  type="number" className="h-8 text-xs"
                  value={rules.min_aov || ''}
                  onChange={(e) => updateRule('min_aov', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Criar e Calcular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
