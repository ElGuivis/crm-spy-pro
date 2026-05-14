import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Save, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { WatchlistRule } from '@/hooks/useInstagramAutomations';
import type { LucideIcon } from 'lucide-react';

interface SimpleAutomationCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  mediaType: string;
  rule: WatchlistRule | null;
  onSave: (data: Partial<WatchlistRule> & { media_type: string }) => Promise<void>;
  onDelete?: (ruleId: string) => Promise<void>;
  showDelay?: boolean;
  showFirstOnly?: boolean;
  defaultFirstOnly?: boolean;
  messagePlaceholder?: string;
}

export function SimpleAutomationCard({
  title, description, icon: Icon, mediaType, rule, onSave, onDelete,
  showDelay = true,
  showFirstOnly = false,
  defaultFirstOnly = false,
  messagePlaceholder = 'Ex: Obrigado! Vou te enviar mais detalhes...',
}: SimpleAutomationCardProps) {
  const [isActive, setIsActive] = useState(rule?.is_active ?? false);
  const [replyText, setReplyText] = useState(rule?.reply_public_variants?.[0] ?? '');
  const [delaySeconds, setDelaySeconds] = useState(rule?.delay_seconds ?? 3);
  const [firstOnly, setFirstOnly] = useState(rule?.first_comment_only ?? defaultFirstOnly);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (rule) {
      setIsActive(rule.is_active);
      setReplyText(rule.reply_public_variants?.[0] ?? '');
      setDelaySeconds(rule.delay_seconds ?? 3);
      setFirstOnly(rule.first_comment_only ?? defaultFirstOnly);
    }
  }, [rule, defaultFirstOnly]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        id: rule?.id,
        media_type: mediaType,
        watch_mode: 'all',
        is_active: isActive,
        private_reply_enabled: true,
        reply_public_enabled: false,
        reply_public_variants: replyText.trim() ? [replyText.trim()] : null,
        delay_seconds: delaySeconds,
        first_comment_only: showFirstOnly ? firstOnly : defaultFirstOnly,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Icon className="h-5 w-5" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </Badge>
            {rule && onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <Label className="text-sm font-medium">Ativar automação</Label>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
        </div>

        <div className="space-y-2">
          <Label>Mensagem de resposta (DM)</Label>
          <Textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder={messagePlaceholder}
            rows={3}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">{replyText.length}/1000 caracteres</p>
        </div>

        {replyText && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="bg-primary/10 rounded-2xl rounded-bl-none px-4 py-3 max-w-[80%] text-sm">
              {replyText}
            </div>
          </div>
        )}

        {showDelay && (
          <div className="space-y-2">
            <Label>Delay: <strong>{delaySeconds}s</strong></Label>
            <Slider
              value={[delaySeconds]}
              onValueChange={([val]) => setDelaySeconds(val)}
              min={0} max={30} step={1}
            />
          </div>
        )}

        {showFirstOnly && (
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Apenas primeira mensagem</Label>
              <p className="text-xs text-muted-foreground">Responde somente ao primeiro contato de cada usuário</p>
            </div>
            <Switch checked={firstOnly} onCheckedChange={setFirstOnly} />
          </div>
        )}

        <Button onClick={handleSave} disabled={isSaving || !replyText.trim()} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Salvando...' : 'Salvar'}
        </Button>
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover automação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta automação? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => rule && onDelete?.(rule.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
