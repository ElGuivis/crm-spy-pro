import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, MessageSquare, Send, Clock, Loader2, ShoppingBag } from "lucide-react";
import { MediaSelectorDialog } from "./MediaSelectorDialog";
import { useCommentToDmRule, type ResponseMode } from "@/hooks/useCommentToDmRule";
import { CommentRuleWatchMode } from "./comment-to-dm/CommentRuleWatchMode";
import { CommentRuleSingleMode } from "./comment-to-dm/CommentRuleSingleMode";
import { CommentRuleMultiMode } from "./comment-to-dm/CommentRuleMultiMode";
import { CommentRulePublicReply } from "./comment-to-dm/CommentRulePublicReply";
import type { WatchlistRule } from "@/hooks/useInstagramAutomations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: WatchlistRule | null;
  mediaType: "post" | "reel";
  allRulesForType: WatchlistRule[];
  onSave: (data: Partial<WatchlistRule> & { media_type: string }) => Promise<void>;
}

export function CommentToDmRuleEditor({ open, onOpenChange, rule, mediaType, allRulesForType, onSave }: Props) {
  const r = useCommentToDmRule({ open, rule, mediaType, onSave, onOpenChange });
  const isNew = !rule;

  const existingMediaIds = allRulesForType.filter(x => x.media_id && x.id !== rule?.id).map(x => x.media_id!);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="space-y-1">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-[hsl(var(--instagram))]" />
              {isNew ? "Nova regra" : "Editar regra"}
            </SheetTitle>
            <SheetDescription>
              {mediaType === "post"
                ? "Configure a automação para comentários em posts."
                : "Configure a automação para comentários em reels."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            <div className="flex items-center gap-3">
              <Input value={r.ruleName} onChange={(e) => r.setRuleName(e.target.value)} placeholder="Nome da regra (opcional)" className="text-sm flex-1" />
              <div className="flex items-center gap-2 shrink-0">
                <div className={`h-2 w-2 rounded-full ${r.isActive ? "bg-[hsl(var(--success))]" : "bg-muted-foreground/30"}`} />
                <Switch checked={r.isActive} onCheckedChange={r.setIsActive} />
              </div>
            </div>

            <Separator />

            <CommentRuleWatchMode
              mediaType={mediaType}
              watchMode={r.watchMode}
              selectedMediaId={r.selectedMediaId}
              selectedMediaCaption={r.selectedMediaCaption}
              onSelectAll={() => { r.setWatchMode("all"); r.clearSpecificMedia(); }}
              onOpenMediaSelector={() => r.setMediaSelectorOpen(true)}
              onClearSpecific={r.clearSpecificMedia}
            />

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Send className="h-4 w-4 text-muted-foreground" />
                Modo de resposta
              </Label>
              <Tabs value={r.responseMode} onValueChange={(v) => r.setResponseMode(v as ResponseMode)}>
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

                <CommentRuleSingleMode
                  keywords={r.keywords}
                  newKeyword={r.newKeyword}
                  dmMessage={r.dmMessage}
                  onNewKeywordChange={r.setNewKeyword}
                  onAddKeyword={r.addKeyword}
                  onRemoveKeyword={r.removeKeyword}
                  onDmMessageChange={r.setDmMessage}
                />

                <CommentRuleMultiMode
                  keywordResponses={r.keywordResponses}
                  newKrKeyword={r.newKrKeyword}
                  newKrMessage={r.newKrMessage}
                  onNewKrKeywordChange={r.setNewKrKeyword}
                  onNewKrMessageChange={r.setNewKrMessage}
                  onAdd={r.addKeywordResponse}
                  onRemove={r.removeKeywordResponse}
                />
              </Tabs>
            </div>

            <Separator />

            <CommentRulePublicReply
              enabled={r.publicReplyEnabled}
              variants={r.replyVariants}
              newVariant={r.newVariant}
              onEnabledChange={r.setPublicReplyEnabled}
              onNewVariantChange={r.setNewVariant}
              onAddVariant={r.addVariant}
              onRemoveVariant={r.removeVariant}
            />

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div>
                  <Label className="text-xs font-medium">DM privada</Label>
                  <p className="text-[10px] text-muted-foreground">Private Reply API</p>
                </div>
                <Switch checked={r.privateReplyEnabled} onCheckedChange={r.setPrivateReplyEnabled} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
                <div>
                  <Label className="text-xs font-medium">1º comentário</Label>
                  <p className="text-[10px] text-muted-foreground">Evita duplicidade</p>
                </div>
                <Switch checked={r.firstCommentOnly} onCheckedChange={r.setFirstCommentOnly} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Delay: <span className="text-[hsl(var(--instagram))]">{r.delaySeconds}s</span>
              </Label>
              <Slider value={[r.delaySeconds]} onValueChange={([val]) => r.setDelaySeconds(val)} min={0} max={30} step={1} />
            </div>
          </div>

          <SheetFooter>
            <Button onClick={r.handleSave} disabled={r.isSaving || !r.canSave} className="w-full gap-2">
              {r.isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {r.isSaving ? "Salvando..." : isNew ? "Criar regra" : "Salvar alterações"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <MediaSelectorDialog
        open={r.mediaSelectorOpen}
        onOpenChange={r.setMediaSelectorOpen}
        mediaType={mediaType}
        selectedMediaIds={[...(r.selectedMediaId ? [r.selectedMediaId] : []), ...existingMediaIds]}
        onSelect={r.handleMediaSelect}
      />
    </>
  );
}
