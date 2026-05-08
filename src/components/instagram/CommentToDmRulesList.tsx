import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Plus, MessageSquare, Image, Film, Globe, Target,
  Trash2, Pencil, Zap, Clock, ShoppingBag,
} from 'lucide-react';
import { CommentToDmRuleEditor } from './CommentToDmRuleEditor';
import type { WatchlistRule } from '@/hooks/useInstagramAutomations';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface CommentToDmRulesListProps {
  rules: WatchlistRule[];
  allRulesForType: WatchlistRule[];
  mediaType: 'post' | 'reel';
  onSave: (data: Partial<WatchlistRule> & { media_type: string }) => Promise<void>;
  onToggle: (ruleId: string, isActive: boolean) => Promise<void>;
  onDelete: (ruleId: string) => Promise<void>;
}

export function CommentToDmRulesList({
  rules, allRulesForType, mediaType, onSave, onToggle, onDelete,
}: CommentToDmRulesListProps) {
  const [editingRule, setEditingRule] = useState<WatchlistRule | 'new' | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const Icon = mediaType === 'post' ? Image : Film;
  const label = mediaType === 'post' ? 'Posts' : 'Reels';
  const activeCount = rules.filter(r => r.is_active).length;

  const handleSave = async (data: Partial<WatchlistRule> & { media_type: string }) => {
    await onSave(data);
    setEditingRule(null);
  };

  const handleDelete = async () => {
    if (deletingRuleId) {
      await onDelete(deletingRuleId);
      setDeletingRuleId(null);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-[hsl(var(--instagram))] to-[hsl(330,90%,45%)] text-white">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <span>Comment-to-DM — {label}</span>
                <p className="text-xs font-normal text-muted-foreground mt-0.5">
                  {rules.length === 0
                    ? 'Nenhuma regra configurada'
                    : `${rules.length} regra${rules.length > 1 ? 's' : ''} · ${activeCount} ativa${activeCount !== 1 ? 's' : ''}`}
                </p>
              </div>
            </CardTitle>
            <Button
              size="sm"
              onClick={() => setEditingRule('new')}
              className="gap-1.5 bg-gradient-to-r from-[hsl(var(--instagram))] to-[hsl(330,90%,45%)] hover:opacity-90 text-white border-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova regra
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center border-t border-border">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-muted mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Crie sua primeira regra
              </p>
              <p className="text-xs text-muted-foreground max-w-xs mb-4">
                Defina palavras-chave e respostas automáticas para comentários em seus {label.toLowerCase()}.
              </p>
              <Button variant="outline" size="sm" onClick={() => setEditingRule('new')} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Criar regra
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={onToggle}
                  onEdit={() => setEditingRule(rule)}
                  onDelete={() => setDeletingRuleId(rule.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CommentToDmRuleEditor
        open={editingRule !== null}
        onOpenChange={(open) => { if (!open) setEditingRule(null); }}
        rule={editingRule === 'new' ? null : editingRule}
        mediaType={mediaType}
        allRulesForType={allRulesForType}
        onSave={handleSave}
      />

      <AlertDialog open={!!deletingRuleId} onOpenChange={(o) => { if (!o) setDeletingRuleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover regra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra de automação? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RuleRow({
  rule, onToggle, onEdit, onDelete,
}: {
  rule: WatchlistRule;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const keywords = rule.keywords_include ?? [];
  const isSpecific = rule.watch_mode === 'specific' && rule.media_id;
  const isMulti = (rule.keyword_responses ?? []).length > 0;
  const displayName = rule.rule_name || (isMulti ? 'Multi-produto' : (isSpecific ? 'Publicação específica' : 'Todos'));

  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
      {/* Status indicator */}
      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${rule.is_active ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/30'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onEdit}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
            {isMulti ? (
              <ShoppingBag className="h-3.5 w-3.5 text-[hsl(var(--instagram))] shrink-0" />
            ) : isSpecific ? (
              <Target className="h-3.5 w-3.5 text-[hsl(var(--instagram))] shrink-0" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            {displayName}
          </span>
          {isMulti && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[hsl(var(--instagram))]/30 text-[hsl(var(--instagram))]">
              {rule.keyword_responses.length} produto{rule.keyword_responses.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {keywords.length > 0 ? (
            <>
              <Zap className="h-3 w-3 text-warning shrink-0" />
              {keywords.slice(0, 5).map(kw => (
                <Badge key={kw} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {kw}
                </Badge>
              ))}
              {keywords.length > 5 && (
                <span className="text-[10px] text-muted-foreground">+{keywords.length - 5}</span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Todos os comentários</span>
          )}

          {rule.delay_seconds && rule.delay_seconds > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Clock className="h-2.5 w-2.5" />
              {rule.delay_seconds}s
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Switch
          checked={rule.is_active}
          onCheckedChange={(active) => onToggle(rule.id, active)}
          className="scale-90"
        />
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
