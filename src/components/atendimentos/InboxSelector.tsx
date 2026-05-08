import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Inbox } from "@/hooks/useInboxes";
import { Wifi, WifiOff } from "lucide-react";

interface InboxSelectorProps {
  inboxes: Inbox[];
  selectedInboxId: string | null;
  onSelect: (inboxId: string | null) => void;
}

export function InboxSelector({ inboxes, selectedInboxId, onSelect }: InboxSelectorProps) {
  return (
    <Select
      value={selectedInboxId || "all"}
      onValueChange={(v) => onSelect(v === "all" ? null : v)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Todas as inboxes" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas as inboxes</SelectItem>
        {inboxes.map((inbox) => (
          <SelectItem key={inbox.id} value={inbox.id}>
            <div className="flex items-center gap-2">
              {(inbox.channel as any)?.status === 'connected' ? (
                <Wifi className="h-3 w-3 text-green-500" />
              ) : (
                <WifiOff className="h-3 w-3 text-muted-foreground" />
              )}
              {inbox.name}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
