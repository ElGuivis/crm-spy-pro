import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Save, MessageSquare, X, Plus, Image, Film, Globe, Target } from 'lucide-react';
import { MediaSelectorDialog } from './MediaSelectorDialog';
import type { WatchlistRule } from '@/hooks/useInstagramAutomations';
import type { InstagramMedia } from '@/hooks/useInstagramMedia';

interface CommentToDmCardProps {
  rule: WatchlistRule | null;
  mediaType: 'post' | 'reel';
  onSave: (data: Partial<WatchlistRule> & { media_type: string }) => Promise<void>;
  onToggle?: (ruleId: string, isActive: boolean) => Promise<void>;
  allRulesForType?: WatchlistRule[];
  onAddRule?: () => void;
}

export function CommentToDmCard({ rule, mediaType, onSave, onToggle, allRulesForType, onAddRule }: CommentToDmCardProps) {
  const [isActive, setIsActive] = useState(rule?.is_active ?? false);
  const [watchMode, setWatchMode] = useState<'all' | 'specific'>(rule?.watch_mode === 'specific' ? 'specific' : 'all');
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(rule?.media_id ?? null);
  const [selectedMediaCaption, setSelectedMediaCaption] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<string[]>(rule?.keywords_include ?? []);
  const [newKeyword, setNewKeyword] = useState('');
  const [replyVariants, setReplyVariants] = useState<string[]>(rule?.reply_public_variants ?? []);
  const [newVariant, setNewVariant] = useState('');
  const [privateReplyEnabled, setPrivateReplyEnabled] = useState(rule?.private_reply_enabled ?? true);
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(rule?.reply_public_enabled ?? false);
  const [firstCommentOnly, setFirstCommentOnly] = useState(rule?.first_comment_only ?? true);
  const [delaySeconds, setDelaySeconds] = useState(rule?.delay_seconds ?? 3);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaSelectorOpen, setMediaSelectorOpen] = useState(false);

  useEffect(() => {
    if (rule) {
      setIsActive(rule.is_active);
      setWatchMode(rule.watch_mode === 'specific' ? 'specific' : 'all');
      setSelectedMediaId(rule.media_id);
      setKeywords(rule.keywords_include ?? []);
      setReplyVariants(rule.reply_public_variants ?? []);
      setPrivateReplyEnabled(rule.private_reply_enabled);
      setPublicReplyEnabled(rule.reply_public_enabled);
      setFirstCommentOnly(rule.first_comment_only);
      setDelaySeconds(rule.delay_seconds ?? 3);
    }
  }, [rule]);

  const title = mediaType === 'post' ? 'Comment-to-DM (Posts)' : 'Comment-to-DM (Reels)';
  const description = mediaType === 'post'
    ? 'Responda automaticamente quando alguém comenta em seus posts com palavras-chave específicas.'
    : 'Responda automaticamente quando alguém comenta em seus reels com palavras-chave específicas.';

  const addKeyword = () => {
    const kw = newKeyword.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setNewKeyword('');
    }
  };

  const addVariant = () => {
    const v = newVariant.trim();
    if (v && !replyVariants.includes(v)) {
      setReplyVariants([...replyVariants, v]);
      setNewVariant('');
    }
  };

  const handleMediaSelect = (media: InstagramMedia) => {
    setSelectedMediaId(media.id);
    setSelectedMediaCaption(media.caption);
    setWatchMode('specific');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        id: rule?.id,
        media_type: mediaType,
        watch_mode: watchMode,
        media_id: watchMode === 'specific' ? selectedMediaId : null,
        is_active: isActive,
        keywords_include: keywords.length > 0 ? keywords : null,
        reply_public_enabled: publicReplyEnabled,
        reply_public_variants: replyVariants.length > 0 ? replyVariants : null,
        private_reply_enabled: privateReplyEnabled,
        first_comment_only: firstCommentOnly,
        delay_seconds: delaySeconds,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const existingMediaIds = (allRulesForType || [])
    .filter(r => r.media_id && r.id !== rule?.id)
    .map(r => r.media_id!);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquare className="h-5 w-5" />
                {title}
                {watchMode === 'specific' && selectedMediaId && (
                  <Badge variant="outline" className="text-xs font-normal gap-1">
                    <Target className="h-3 w-3" />
                    Publicação específica
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <Label className="text-sm font-medium">Ativar automação</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Watch Mode: All vs Specific */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Aplicar em</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setWatchMode('all'); setSelectedMediaId(null); }}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                  watchMode === 'all'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Globe className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Todos os {mediaType === 'post' ? 'posts' : 'reels'}</div>
                  <div className="text-xs text-muted-foreground">Qualquer publicação</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMediaSelectorOpen(true)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                  watchMode === 'specific'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <Target className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium">Publicação específica</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedMediaId ? 'Alterar seleção' : 'Escolher publicação'}
                  </div>
                </div>
              </button>
            </div>

            {/* Show selected media info */}
            {watchMode === 'specific' && selectedMediaId && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm">
                {mediaType === 'reel' ? <Film className="h-4 w-4 text-muted-foreground shrink-0" /> : <Image className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-muted-foreground truncate flex-1">
                  {selectedMediaCaption || `ID: ${selectedMediaId}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => { setWatchMode('all'); setSelectedMediaId(null); setSelectedMediaCaption(null); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label>Palavras-chave (gatilho)</Label>
            <div className="flex gap-2">
              <Input
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                placeholder="Ex: QUERO, LINK, INFO"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
              />
              <Button variant="outline" size="sm" onClick={addKeyword} type="button">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {keywords.map(kw => (
                <Badge key={kw} variant="secondary" className="gap-1">
                  {kw}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => setKeywords(keywords.filter(k => k !== kw))} />
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {keywords.length === 0 ? 'Sem palavras-chave = responde a todos os comentários' : `${keywords.length} palavra(s)-chave configurada(s)`}
            </p>
          </div>

          {/* Public reply */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Resposta pública (comentário)</Label>
              <Switch checked={publicReplyEnabled} onCheckedChange={setPublicReplyEnabled} />
            </div>
            {publicReplyEnabled && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newVariant}
                    onChange={e => setNewVariant(e.target.value)}
                    placeholder="Ex: Enviamos no seu DM! 🚀"
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addVariant())}
                  />
                  <Button variant="outline" size="sm" onClick={addVariant} type="button">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {replyVariants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted/30 px-3 py-1.5 rounded">
                      <span className="flex-1">{v}</span>
                      <X className="h-3 w-3 cursor-pointer text-muted-foreground" onClick={() => setReplyVariants(replyVariants.filter((_, idx) => idx !== i))} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Variações rotacionam automaticamente (round-robin).</p>
              </div>
            )}
          </div>

          {/* Private reply (DM) */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <Label className="text-sm font-medium">Enviar DM privada</Label>
              <p className="text-xs text-muted-foreground">Envia mensagem privada via API Private Reply</p>
            </div>
            <Switch checked={privateReplyEnabled} onCheckedChange={setPrivateReplyEnabled} />
          </div>

          {/* First comment only */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div>
              <Label className="text-sm font-medium">Apenas 1º comentário por usuário</Label>
              <p className="text-xs text-muted-foreground">Evita responder múltiplas vezes ao mesmo usuário no mesmo post</p>
            </div>
            <Switch checked={firstCommentOnly} onCheckedChange={setFirstCommentOnly} />
          </div>

          {/* Delay */}
          <div className="space-y-2">
            <Label>Delay antes de responder: <strong>{delaySeconds}s</strong></Label>
            <Slider
              value={[delaySeconds]}
              onValueChange={([val]) => setDelaySeconds(val)}
              min={0} max={30} step={1}
            />
            <p className="text-xs text-muted-foreground">Um delay torna a resposta mais natural.</p>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </CardContent>
      </Card>

      <MediaSelectorDialog
        open={mediaSelectorOpen}
        onOpenChange={setMediaSelectorOpen}
        mediaType={mediaType}
        selectedMediaIds={[...(selectedMediaId ? [selectedMediaId] : []), ...existingMediaIds]}
        onSelect={handleMediaSelect}
      />
    </>
  );
}
