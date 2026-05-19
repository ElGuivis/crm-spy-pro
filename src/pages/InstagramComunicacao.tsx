import { useState, useEffect } from 'react';
import { Instagram, Plug, MessageSquare, Reply, AtSign, Inbox, ChevronDown, Circle, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useInstagramChannel } from '@/hooks/useInstagramChannel';
import { useInstagramAutomations } from '@/hooks/useInstagramAutomations';
import { CommentToDmRulesList } from '@/components/instagram/CommentToDmRulesList';
import { SimpleAutomationCard } from '@/components/instagram/SimpleAutomationCard';
import { ContentCalendar } from '@/components/instagram/ContentCalendar';
import { Link } from 'react-router-dom';

export default function InstagramComunicacao() {
  const { channels, isLoading } = useInstagramChannel();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const connectedChannels = channels.filter(c => c.status === 'connected');

  useEffect(() => {
    if (!selectedChannelId && connectedChannels.length > 0) {
      setSelectedChannelId(connectedChannels[0].id);
    }
  }, [connectedChannels, selectedChannelId]);

  const selectedChannel = connectedChannels.find(c => c.id === selectedChannelId) ?? null;

  const {
    rules,
    getActiveRuleForType, getRulesForType,
    upsertRule, toggleRule, deleteRule,
  } = useInstagramAutomations(selectedChannelId);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 animate-fade-in">
        <div className="h-8 w-48 rounded-lg bg-muted shimmer" />
        <div className="h-64 rounded-xl border border-border bg-card shimmer" />
      </div>
    );
  }

  if (connectedChannels.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Instagram className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Instagram</h1>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Instagram className="h-12 w-12 text-muted-foreground" />
            <CardTitle className="text-lg">Conecte sua conta do Instagram</CardTitle>
            <CardDescription className="text-center max-w-md">
              Para usar as automações de Instagram, primeiro conecte sua conta Business na página de Integrações.
            </CardDescription>
            <Button asChild>
              <Link to="/integrations">
                <Plug className="h-4 w-4 mr-2" />
                Ir para Integrações
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const postRules = getRulesForType('post');
  const reelRules = getRulesForType('reel');
  const storyReplyRule = getActiveRuleForType('story_reply') || getRulesForType('story_reply')[0] || null;
  const storyMentionRule = getActiveRuleForType('story_mention') || getRulesForType('story_mention')[0] || null;

  const activeCount = rules.filter(r => r.is_active).length;
  const commentRulesCount = postRules.length + reelRules.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-[hsl(var(--instagram))] to-[hsl(330,90%,45%)] text-white">
            <Instagram className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Automações</h1>
            {connectedChannels.length === 1 ? (
              <p className="text-sm text-muted-foreground">
                @{selectedChannel?.instagram_username || selectedChannel?.name}
              </p>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    @{selectedChannel?.instagram_username || selectedChannel?.name}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {connectedChannels.map(ch => (
                    <DropdownMenuItem
                      key={ch.id}
                      onSelect={() => setSelectedChannelId(ch.id)}
                      className="flex items-center gap-2"
                    >
                      <Circle
                        className={`h-2 w-2 fill-current ${ch.id === selectedChannelId ? 'text-green-500' : 'text-muted-foreground/30'}`}
                      />
                      <span className="font-medium">@{ch.instagram_username || ch.name}</span>
                      {ch.id === selectedChannelId && (
                        <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">ativo</Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connectedChannels.length > 1 && (
            <Badge variant="outline" className="h-7 text-xs">
              {connectedChannels.length} contas
            </Badge>
          )}
          <Badge variant={activeCount > 0 ? 'default' : 'secondary'} className="h-7">
            {activeCount} ativa{activeCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="comments" className="space-y-5">
        <TabsList className="grid w-full grid-cols-5 h-11">
          <TabsTrigger value="comments" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Comments</span>
            {commentRulesCount > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
                {commentRulesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="auto-reply" className="gap-1.5 text-xs sm:text-sm">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Auto-Reply</span>
          </TabsTrigger>
          <TabsTrigger value="story-reply" className="gap-1.5 text-xs sm:text-sm">
            <Reply className="h-4 w-4" />
            <span className="hidden sm:inline">Story Reply</span>
          </TabsTrigger>
          <TabsTrigger value="story-mention" className="gap-1.5 text-xs sm:text-sm">
            <AtSign className="h-4 w-4" />
            <span className="hidden sm:inline">Mention</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendário</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comments" className="space-y-5">
          <CommentToDmRulesList
            rules={postRules}
            allRulesForType={postRules}
            mediaType="post"
            onSave={upsertRule}
            onToggle={toggleRule}
            onDelete={deleteRule}
          />
          <CommentToDmRulesList
            rules={reelRules}
            allRulesForType={reelRules}
            mediaType="reel"
            onSave={upsertRule}
            onToggle={toggleRule}
            onDelete={deleteRule}
          />
        </TabsContent>

        <TabsContent value="auto-reply">
          <SimpleAutomationCard
            title="Auto-Reply para DMs"
            description="Responda automaticamente quando alguém envia a primeira mensagem no seu Instagram."
            icon={Inbox}
            mediaType="dm_auto_reply"
            rule={getActiveRuleForType('dm_auto_reply') || getRulesForType('dm_auto_reply')[0] || null}
            onSave={upsertRule}
            onDelete={deleteRule}
            showFirstOnly
            defaultFirstOnly
            messagePlaceholder="Ex: Olá! Obrigado por entrar em contato 🎉 Como posso ajudar?"
          />
        </TabsContent>

        <TabsContent value="story-reply">
          <SimpleAutomationCard
            title="Resposta a Story Replies"
            description="Envie uma DM automática quando alguém responde ao seu story."
            icon={Reply}
            mediaType="story_reply"
            rule={storyReplyRule}
            onSave={upsertRule}
            onDelete={deleteRule}
            defaultFirstOnly={false}
            messagePlaceholder="Ex: Obrigado por responder ao meu story! 💜"
          />
        </TabsContent>

        <TabsContent value="story-mention">
          <SimpleAutomationCard
            title="Resposta a Menções no Story"
            description="Envie uma DM automática quando alguém menciona sua conta em um story."
            icon={AtSign}
            mediaType="story_mention"
            rule={storyMentionRule}
            onSave={upsertRule}
            onDelete={deleteRule}
            defaultFirstOnly={false}
            messagePlaceholder="Ex: Vi que você me mencionou! Obrigado pelo carinho 🙏"
          />
        </TabsContent>

        <TabsContent value="calendar">
          {selectedChannelId ? (
            <ContentCalendar channelId={selectedChannelId} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Selecione um canal para ver o calendário.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
