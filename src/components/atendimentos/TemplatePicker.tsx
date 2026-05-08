import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { useState } from "react";

interface TemplatePickerProps {
  wabaId: string | null;
  phoneNumberId: string | null;
  toPhone: string;
  conversationId: string;
  onSent?: () => void;
}

/**
 * TemplatePicker — placeholder while the meta-api edge function is not implemented.
 * The button is shown but the dialog explains the feature is unavailable.
 */
export function TemplatePicker({ wabaId }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);

  if (!wabaId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs">
          <FileText className="h-3.5 w-3.5" />
          Enviar Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Templates WhatsApp</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground text-center py-6">
          O envio de templates Meta ainda não está disponível nesta versão.
        </p>
      </DialogContent>
    </Dialog>
  );
}
