import { forwardRef } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eye } from "lucide-react";

interface Variable {
  key: string;
  label: string;
  always: boolean;
}

interface Props {
  messageTemplate: string;
  onMessageChange: (v: string) => void;
  availableVariables: Variable[];
  onInsertVariable: (key: string) => void;
  previewMessage: string;
  hasContacts: boolean;
}

export const CampaignMessageEditor = forwardRef<HTMLTextAreaElement, Props>(({
  messageTemplate, onMessageChange, availableVariables, onInsertVariable, previewMessage, hasContacts,
}, ref) => {
  return (
    <div className="space-y-2">
      <Label>Mensagem</Label>
      <Textarea
        ref={ref}
        placeholder="Olá {primeiro_nome}, temos uma oferta especial para você!"
        rows={4}
        value={messageTemplate}
        onChange={(e) => onMessageChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-muted-foreground mr-1 self-center">Variáveis:</span>
        {availableVariables.map(v => (
          <button
            key={v.key}
            type="button"
            onClick={() => onInsertVariable(v.key)}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
          >
            {`{${v.key}}`}
          </button>
        ))}
      </div>
      {messageTemplate && hasContacts && (
        <div className="p-3 bg-muted/40 rounded-lg border border-border/50 space-y-1">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" />Preview (1º contato):
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{previewMessage}</p>
        </div>
      )}
    </div>
  );
});

CampaignMessageEditor.displayName = "CampaignMessageEditor";
