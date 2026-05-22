import { AlertCircle, Loader2, MessageSquare, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  StatusRule, OrderNotificationConfig, DelayUnit,
  DELAY_UNIT_LABELS, MESSAGE_PLACEHOLDERS, delayConfigToMinutes,
} from "@/hooks/useOrderNotificationConfig";

interface OrderNotificationStatusRulesProps {
  config: OrderNotificationConfig;
  availableStatuses: string[];
  isLoadingStatuses: boolean;
  toggleStatusRule: (statusName: string) => void;
  updateRuleMessage: (statusName: string, message: string) => void;
  updateRuleDelayParts: (statusName: string, value: number, unit: DelayUnit) => void;
  insertPlaceholder: (placeholder: string, statusName: string) => void;
}

export function OrderNotificationStatusRules({
  config, availableStatuses, isLoadingStatuses,
  toggleStatusRule, updateRuleMessage, updateRuleDelayParts, insertPlaceholder,
}: OrderNotificationStatusRulesProps) {
  const enabledRules = config.status_rules.filter((r) => r.is_enabled);

  return (
    <>
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Status para Notificação
        </Label>

        {isLoadingStatuses ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Carregando status...</span>
          </div>
        ) : availableStatuses.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm text-yellow-600">Nenhum status encontrado. Sincronize alguns pedidos primeiro.</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {availableStatuses.map((status) => {
              const rule = config.status_rules.find((r) => r.status_name === status);
              const isEnabled = rule?.is_enabled ?? false;
              return (
                <div
                  key={status}
                  className={cn("flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all", isEnabled ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30")}
                  onClick={() => toggleStatusRule(status)}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", isEnabled ? "bg-primary" : "bg-muted-foreground/30")} />
                    <span className="text-sm font-medium">{status}</span>
                  </div>
                  <Switch checked={isEnabled} onCheckedChange={() => toggleStatusRule(status)} onClick={(e) => e.stopPropagation()} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {enabledRules.length > 0 && (
        <div className="space-y-3">
          <Label className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Mensagens por Status
          </Label>

          <Tabs defaultValue={enabledRules[0]?.status_name} className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
              {enabledRules.map((rule) => (
                <TabsTrigger key={rule.status_name} value={rule.status_name} className="text-xs px-2 py-1">
                  {rule.status_name}
                </TabsTrigger>
              ))}
            </TabsList>

            {enabledRules.map((rule: StatusRule) => (
              <TabsContent key={rule.status_name} value={rule.status_name} className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {MESSAGE_PLACEHOLDERS.map((p) => (
                    <Badge key={p.key} variant="outline" className="cursor-pointer hover:bg-primary/10 text-xs" onClick={() => insertPlaceholder(p.key, rule.status_name)}>
                      <Plus className="h-3 w-3 mr-1" />{p.label}
                    </Badge>
                  ))}
                </div>

                <Textarea
                  value={rule.message_template}
                  onChange={(e) => updateRuleMessage(rule.status_name, e.target.value)}
                  placeholder="Digite a mensagem para este status..."
                  className="min-h-[100px]"
                />

                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="text-sm whitespace-nowrap">Atraso:</Label>
                  <Input
                    type="number" min={0} value={rule.delay_value ?? 0} className="w-20"
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      updateRuleDelayParts(rule.status_name, val, rule.delay_unit || "minutes");
                    }}
                  />
                  <Select
                    value={rule.delay_unit || "minutes"}
                    onValueChange={(unit: DelayUnit) => updateRuleDelayParts(rule.status_name, rule.delay_value ?? 0, unit)}
                  >
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DELAY_UNIT_LABELS) as DelayUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>{DELAY_UNIT_LABELS[u]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(rule.delay_value ?? 0) === 0 && (rule.delay_unit || "minutes") === "minutes" && (
                    <span className="text-xs text-muted-foreground">0 = envio imediato</span>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </>
  );
}
