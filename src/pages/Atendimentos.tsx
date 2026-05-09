import { useState, useMemo } from "react";
import { useInboxes } from "@/hooks/useInboxes";
import { useConversations, useConversationsRealtime } from "@/hooks/useAtendimentos";
import { InboxSelector } from "@/components/atendimentos/InboxSelector";
import { ConversationList } from "@/components/atendimentos/ConversationList";
import { ChatWindow } from "@/components/atendimentos/ChatWindow";
import { CustomerPanel } from "@/components/atendimentos/CustomerPanel";
import { InboxSettings } from "@/components/atendimentos/settings/InboxSettings";
import { AutoCloseSettings } from "@/components/atendimentos/settings/AutoCloseSettings";
import { ChannelSettings } from "@/components/atendimentos/settings/ChannelSettings";
import { AtendimentoReports } from "@/components/atendimentos/settings/AtendimentoReports";
import { ChatbotBuilder } from "@/components/atendimentos/settings/ChatbotBuilder";
import { AIAgentBuilder } from "@/components/atendimentos/settings/AIAgentBuilder";
import { Headset, MessageSquare, Inbox, Bot, Smartphone, BarChart3, Brain, Menu } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Atendimentos() {
  const { inboxes } = useInboxes();
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState("conversas");
  const isMobile = useIsMobile();

  // Mobile: track if we're viewing the chat (vs list)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  useConversationsRealtime();
  const { conversations } = useConversations(selectedInboxId, {});
  
  const selectedConversation = useMemo(() => 
    conversations.find(c => c.id === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const channelInfo = useMemo(() => {
    if (!selectedConversation?.channel_id) return { status: null, provider: null, wabaId: null, phoneNumberId: null, integrationId: null };
    const inbox = inboxes.find(i => i.channel_id === selectedConversation.channel_id);
    const channel = inbox?.channel as any;
    return {
      status: channel?.status || null,
      provider: channel?.provider || null,
      wabaId: channel?.waba_id || channel?.metadata_json?.waba_id || null,
      phoneNumberId: channel?.metadata_json?.phone_number_id || null,
      integrationId: inbox?.integration_id || null,
    };
  }, [selectedConversation, inboxes]);

  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id);
    if (isMobile) setMobileView('chat');
  };

  const handleBackToList = () => {
    setMobileView('list');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with tabs */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b bg-card shrink-0">
        <Headset className="h-5 w-5 text-primary shrink-0 hidden md:block" />
        <h1 className="text-base font-semibold text-foreground hidden md:block">Atendimentos</h1>
        <div className={cn("flex-1 overflow-x-auto", isMobile ? "ml-0" : "ml-4")}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-8">
              <TabsTrigger value="conversas" className="gap-1 text-xs h-7 px-2 md:px-2.5">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Conversas</span>
              </TabsTrigger>
              <TabsTrigger value="inboxes" className="gap-1 text-xs h-7 px-2 md:px-2.5">
                <Inbox className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Inboxes</span>
              </TabsTrigger>
              <TabsTrigger value="chatbot" className="gap-1 text-xs h-7 px-2 md:px-2.5">
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chatbot</span>
              </TabsTrigger>
              <TabsTrigger value="agente-ia" className="gap-1 text-xs h-7 px-2 md:px-2.5">
                <Brain className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Agente IA</span>
              </TabsTrigger>
              <TabsTrigger value="canais" className="gap-1 text-xs h-7 px-2 md:px-2.5">
                <Smartphone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Canais</span>
              </TabsTrigger>
              <TabsTrigger value="relatorios" className="gap-1 text-xs h-7 px-2 md:px-2.5">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Relatórios</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {activeTab === "conversas" && (
          <div className="w-36 md:w-48 shrink-0">
            <InboxSelector
              inboxes={inboxes}
              selectedInboxId={selectedInboxId}
              onSelect={setSelectedInboxId}
            />
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "conversas" && (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Conversation List */}
          {(!isMobile || mobileView === 'list') && (
            <div className={cn(
              "border-r flex flex-col min-h-0 bg-card",
              isMobile ? "w-full" : "w-80"
            )}>
              <ConversationList
                inboxId={selectedInboxId}
                selectedConversationId={selectedConversationId}
                onSelectConversation={handleSelectConversation}
              />
            </div>
          )}

          {/* Chat Window */}
          {(!isMobile || mobileView === 'chat') && (
            <div className="flex-1 flex flex-col min-h-0 bg-background">
              <ChatWindow
                conversationId={selectedConversationId}
                conversation={selectedConversation}
                channelStatus={channelInfo.status}
                channelProvider={channelInfo.provider}
                channelWabaId={channelInfo.wabaId}
                channelPhoneNumberId={channelInfo.phoneNumberId}
                integrationId={channelInfo.integrationId}
                onTogglePanel={() => setShowPanel(!showPanel)}
                isPanelOpen={showPanel}
                onBack={isMobile ? handleBackToList : undefined}
              />
            </div>
          )}

          {/* Customer Panel - Sheet on mobile, column on desktop */}
          {showPanel && selectedConversation && (
            isMobile ? (
              <Sheet open={showPanel} onOpenChange={setShowPanel}>
                <SheetContent side="bottom" className="h-[80vh] p-0">
                  <CustomerPanel
                    conversation={selectedConversation}
                    onClose={() => setShowPanel(false)}
                    integrationId={channelInfo.integrationId}
                  />
                </SheetContent>
              </Sheet>
            ) : (
              <div className="w-80 border-l flex flex-col min-h-0 bg-card">
                <CustomerPanel
                  conversation={selectedConversation}
                  onClose={() => setShowPanel(false)}
                  integrationId={channelInfo.integrationId}
                />
              </div>
            )
          )}
        </div>
      )}

      {activeTab === "inboxes" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <InboxSettings />
          <AutoCloseSettings />
        </div>
      )}

      {activeTab === "chatbot" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <ChatbotBuilder />
        </div>
      )}

      {activeTab === "agente-ia" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <AIAgentBuilder />
        </div>
      )}

      {activeTab === "canais" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <ChannelSettings />
        </div>
      )}

      {activeTab === "relatorios" && (
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <AtendimentoReports />
        </div>
      )}
    </div>
  );
}
