import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormData {
  name: string;
  sender_name: string;
  sender_email: string;
  reply_to: string;
}

interface Props {
  formData: FormData;
  onChange: (field: keyof FormData, value: string) => void;
}

export function EmailIntegrationBasicFields({ formData, onChange }: Props) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">Nome da Integração</Label>
        <Input
          id="name"
          placeholder="Ex: E-mail Principal"
          value={formData.name}
          onChange={(e) => onChange("name", e.target.value)}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sender_name">Nome do Remetente</Label>
          <Input
            id="sender_name"
            placeholder="Ex: Minha Loja"
            value={formData.sender_name}
            onChange={(e) => onChange("sender_name", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Nome que aparece no "De:" do e-mail.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sender_email">E-mail do Remetente</Label>
          <Input
            id="sender_email"
            type="email"
            placeholder="contato@empresa.com"
            value={formData.sender_email}
            onChange={(e) => onChange("sender_email", e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="reply_to">Responder Para (Reply-To)</Label>
          <Input
            id="reply_to"
            type="email"
            placeholder="respostas@empresa.com"
            value={formData.reply_to}
            onChange={(e) => onChange("reply_to", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Opcional. Se vazio, usa o e-mail do remetente.</p>
        </div>
      </div>
    </>
  );
}
