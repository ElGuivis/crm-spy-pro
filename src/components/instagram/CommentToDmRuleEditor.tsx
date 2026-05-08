import { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Save, X, Plus, Globe, Target, Image, Film,
  MessageSquare, Send, Clock, Zap, Loader2, Tag, Trash2, ShoppingBag,
} from 'lucide-react';
import { MediaSelectorDialog } from './MediaSelectorDialog';
import type { WatchlistRule, KeywordResponse } from '@/hooks/useInstagramAutomations';
import type { InstagramMedia } from '@/hooks/useInstagramMedia';

interface CommentToDmRuleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: WatchlistRule | null;
  mediaType: 'post' | 'reel';
  allRulesForType: WatchlistRule[];
  onSave: (data: Partial<WatchlistRule> & { media_type: string }) => Promise<void>;
}

type ResponseMode = 'single' | 'multi';

export function CommentToDmRuleEditor({
  open, onOpenChange, rule, mediaType, allRulesForType, onSave,
}: CommentToDmRuleEditorProps) {
  const [ruleName, setRuleName] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [watchMode, setWatchMode] = useState<'all' | 'specific'>('all');
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [selectedMediaCaption, setSelectedMediaCaption] = useState<string | null>(null);
  const [responseMode, setResponseMode] = useState<ResponseMode>('single');

  // Single mode state
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [dmMessage, setDmMessage] = useState('');

  // Multi mode state
  const [keywordResponses, setKeywordResponses] = useState<KeywordResponse[]>([]);
  const [newKrKeyword, setNewKrKeyword] = useState('');
  const [newKrMessage, setNewKrMessage] = useState('');

  // Shared state
  const [replyVariants, setReplyVariants] = useState<string[]>([]);
  const [newVariant, setNewVariant] = useState('');
  const [privateReplyEnabled, setPrivateReplyEnabled] = useState(true);
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [firstCommentOnly, setFirstCommentOnly] = useState(true);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaSelectorOpen, setMediaSelectorOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const kr = rule?.keyword_responses ?? [];
      const hasMulti = kr.length > 0;

      setRuleName(rule?.rule_name ?? '');
      setIsActive(rule?.is_active ?? false);
      setWatchMode(rule?.watch_mode === 'specific' ? 'specific' : 'all');
      setSelectedMediaId(rule?.media_id ?? null);
      setSelectedMediaCaption(null);
      setResponseMode(hasMulti ? 'multi' : 'single');
      setKeywords(rule?.keywords_include ?? []);
      setNewKeyword('');
      setDmMessage(rule?.dm_message ?? '');
      setKeywordResponses(kr);
      setNewKrKeyword('');
      setNewKrMessage('');
      setReplyVariants(rule?.reply_public_variants ?? []);
      setNewVariant('');
      setPrivateReplyEnabled(rule?.private_reply_enabled ?? true);
      setPublicReplyEnabled(rule?.reply_public_enabled ?? false);
      setFirstCommentOnly(rule?.first_comment_only ?? true);
      setDelaySeconds(rule?.delay_seconds ?? 3);
    }
  }, [open, rule]);

  const isNew = !rule;

  const addKeyword = () => {
    const kw = newKeyword.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) {
      setKeywords([...keywords, kw]);
      setNewKeyword('');
    }
  };

  const addKeywordResponse = () => {
    const kw = newKrKeyword.trim().toLowerCase();
    const msg = newKrMessage.trim();
    if (kw && msg && !keywordResponses.some(kr => kr.keyword === kw)) {
      setKeywordResponses([...keywordResponses, { keyword: kw, dm_message: msg }]);
      setNewKrKeyword('');
      setNewKrMessage('');
    }
  };

  const removeKeywordResponse = (keyword: string) => {
    setKeywordResponses(keywordResponses.filter(kr => kr.keyword !== keyword));
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
      const isMulti = responseMode === 'multi';
      await onSave({
        id: rule?.id,
        media_type: mediaType,
        rule_name: ruleName || null,
        watch_mode: watchMode,
        media_id: watchMode === 'specific' ? selectedMediaId : null,
        is_active: isActive,
        keywords_include: isMulti
          ? keywordResponses.map(kr => kr.keyword)
          : (keywords.length > 0 ? keywords : null),
        dm_message: isMulti ? null : (dmMessage || null),
        keyword_responses: isMulti ? keywordResponses : [],
        reply_public_enabled: publicReplyEnabled,
        reply_public_variants: replyVariants.length > 0 ? replyVariants : null,
        private_reply_enabled: privateReplyEnabled,
        first_comment_only: firstCommentOnly,
        delay_seconds: delaySeconds,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const existingMediaIds = allRulesForType
    .filter(r => r.media_id && r.id !== rule?.id)
    .map(r => r.media_id!);

  const MediaIcon = mediaType === 'reel' ? Film : Image;

  const canSave = responseMode === 'multi'
    ? keywordResponses.length > 0
    : true;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[hsl(var(--instagram))]" />
              {isNew ? 'Nova regra' : 'Editar regra'}
            </SheetTitle>
            <SheetDescription>
              {mediaType === 'post'
                ? 'Configure a automação para comentários em posts.'
                : 'Configure a automação para comentários em reels.'}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            {/* Rule name + Active toggle */}
            <div className="flex items-center gap-3">
              <Input
                value={ruleName}
                onChange={e => setRuleName(e.target.value)}
                placeholder="Nome da regra (opcional)"
                className="text-sm flex-1"
              />
              <div className="flex items-center gap-2 shrink-0">
                <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/30'}`} />
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            <Separator />

            {/* Watch Mode */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Target className="h-4 w-4 text-muted-foreground" />
                Aplicar em
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setWatchMode('all'); setSelectedMediaId(null); }}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-sm transition-all ${
                    watchMode === 'all'
                      ? 'border-[hsl(var(--instagram))] bg-[hsl(var(--instagram))]/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <Globe className={`h-4 w-4 ${watchMode === 'all' ? 'text-[hsl(var(--instagram))]' : 'text-muted-foreground'}`} />
                  <div className="text-left">
                    <div className="font-medium text-xs">Todos os {mediaType === 'post' ? 'posts' : 'reels'}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setMediaSelectorOpen(true)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-sm transition-all ${
                    watchMode === 'specific'
                      ? 'border-[hsl(var(--instagram))] bg-[hsl(var(--instagram))]/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <Target className={`h-4 w-4 ${watchMode === 'specific' ? 'text-[hsl(var(--instagram))]' : 'text-muted-foreground'}`} />
                  <div className="text-left">
                    <div className="font-medium text-xs">
                      {selectedMediaId ? 'Alterar publicação' : 'Escolher publicação'}
                    </div>
                  </div>
                </button>
              </div>

              {watchMode === 'specific' && selectedMediaId && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 text-sm border">
                  <MediaIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground truncate flex-1 text-xs">
                    {selectedMediaCaption || `ID: ${selectedMediaId}`}
                  </span>
                  <Button
                    variant="ghost" size="sm" className="h-6 w-6 p-0"
                    onClick={() => { setWatchMode('all'); setSelectedMediaId(null); setSelectedMediaCaption(null); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Response mode selector */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Send className="h-4 w-4 text-muted-foreground" />
                Modo de resposta
              </Label>
              <Tabs value={responseMode} onValueChange={v => setResponseMode(v as ResponseMode)}>
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="single" className="gap-1.5 text-xs">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Resposta única
                  </TabsTrigger>
                  <TabsTrigger value="multi" className="gap-1.5 text-xs">
                    <ShoppingBag className="h-3.5 w-3.5" />
                    Multi-produto
                  </TabsTrigger>
                </TabsList>

                {/* Single mode */}
                <TabsContent value="single" className="space-y-4 mt-4">
                  {/* Keywords */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-warning" />
                      Palavras-chave (gatilho)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={newKeyword}
                        onChange={e => setNewKeyword(e.target.value)}
                        placeholder="Ex: QUERO, LINK, INFO"
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                        className="text-sm"
                      />
                      <Button variant="outline" size="icon" onClick={addKeyword} type="button" className="shrink-0">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.map(kw => (
                          <Badge key={kw} variant="secondary" className="gap-1 pl-2.5 pr-1 py-1 font-mono text-xs">
                            {kw}
                            <button onClick={() => setKeywords(keywords.filter(k => k !== kw))} className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {keywords.length === 0 ? 'Sem palavras-chave = responde a todos os comentários' : `${keywords.length} gatilho${keywords.length > 1 ? 's' : ''}`}
                    </p>
                  </div>

                  {/* DM Message */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Send className="h-3.5 w-3.5 text-muted-foreground" />
                      Mensagem da DM
                    </Label>
                    <Textarea
                      value={dmMessage}
                      onChange={e => setDmMessage(e.target.value)}
                      placeholder="Ex: Olá! Aqui está o link que você pediu 🔗 https://..."
                      rows={3}
                      className="text-sm resize-none"
                    />
                  </div>
                </TabsContent>

                {/* Multi mode */}
                <TabsContent value="multi" className="space-y-4 mt-4">
                  <div className="rounded-xl border border-dashed border-[hsl(var(--instagram))]/30 bg-[hsl(var(--instagram))]/5 p-3">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Modo Live Shop:</strong> Cada palavra-chave envia uma DM diferente. Ideal para lives com múltiplos produtos.
                    </p>
                  </div>

                  {/* Add new keyword→response */}
                  <div className="space-y-2 p-3 rounded-xl border bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-[hsl(var(--instagram))]" />
                      <Label className="text-xs font-medium">Novo produto</Label>
                    </div>
                    <Input
                      value={newKrKeyword}
                      onChange={e => setNewKrKeyword(e.target.value)}
                      placeholder="Palavra-chave (ex: prod1)"
                      className="text-sm"
                    />
                    <Textarea
                      value={newKrMessage}
                      onChange={e => setNewKrMessage(e.target.value)}
                      placeholder="Mensagem da DM (ex: Aqui o link: https://...)"
                      rows={2}
                      className="text-sm resize-none"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addKeywordResponse}
                      disabled={!newKrKeyword.trim() || !newKrMessage.trim()}
                      className="w-full gap-1.5"
                      type="button"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar produto
                    </Button>
                  </div>

                  {/* List */}
                  {keywordResponses.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground">
                        {keywordResponses.length} produto{keywordResponses.length > 1 ? 's' : ''} configurado{keywordResponses.length > 1 ? 's' : ''}
                      </Label>
                      <div className="space-y-2">
                        {keywordResponses.map((kr, i) => (
                          <div
                            key={kr.keyword}
                            className="flex items-start gap-3 p-3 rounded-xl border bg-card group"
                          >
                            <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[hsl(var(--instagram))]/10 text-[hsl(var(--instagram))] text-xs font-bold shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0 space-y-1">
                              <Badge variant="secondary" className="font-mono text-xs">
                                {kr.keyword}
                              </Badge>
                              <p className="text-xs text-muted-foreground line-clamp-2">{kr.dm_message}</p>
                            </div>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive shrink-0"
                              onClick={() => removeKeywordResponse(kr.keyword)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {keywordResponses.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      Adicione pelo menos um produto para ativar a regra.
                    </p>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <Separator />

            {/* Public reply */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Resposta pública (comentário)
                </Label>
                <Switch checked={publicReplyEnabled} onCheckedChange={setPublicReplyEnabled} />
              </div>
              {publicReplyEnabled && (
                <div className="space-y-2 pl-1">
                  <div className="flex gap-2">
                    <Input
                      value={newVariant}
                      onChange={e => setNewVariant(e.target.value)}
                      placeholder="Ex: Enviamos no seu DM! 🚀"
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addVariant())}
                      className="text-sm"
                    />
                    <Button variant="outline" size="icon" onClick={addVariant} type="button" className="shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {replyVariants.length > 0 && (
                    <div className="space-y-1.5">
                      {replyVariants.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm bg-muted/40 px-3 py-2 rounded-lg">
                          <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}.</span>
                          <span className="flex-1 text-xs">{v}</span>
                          <button onClick={() => setReplyVariants(replyVariants.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">Variações rotacionam automaticamente.</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Toggles row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div>
                  <Label className="text-xs font-medium">DM privada</Label>
                  <p className="text-[10px] text-muted-foreground">Private Reply API</p>
                </div>
                <Switch checked={privateReplyEnabled} onCheckedChange={setPrivateReplyEnabled} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div>
                  <Label className="text-xs font-medium">1º comentário</Label>
                  <p className="text-[10px] text-muted-foreground">Evita duplicidade</p>
                </div>
                <Switch checked={firstCommentOnly} onCheckedChange={setFirstCommentOnly} />
              </div>
            </div>

            {/* Delay */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Delay: <span className="text-[hsl(var(--instagram))]">{delaySeconds}s</span>
              </Label>
              <Slider
                value={[delaySeconds]}
                onValueChange={([val]) => setDelaySeconds(val)}
                min={0} max={30} step={1}
              />
            </div>
          </div>

          <SheetFooter>
            <Button onClick={handleSave} disabled={isSaving || !canSave} className="w-full gap-2">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Salvando...' : isNew ? 'Criar regra' : 'Salvar alterações'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
