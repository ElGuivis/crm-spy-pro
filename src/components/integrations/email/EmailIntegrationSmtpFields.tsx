import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Eye, EyeOff } from "lucide-react";

interface FormData {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  smtp_secure: boolean;
  smtp_tls: boolean;
}

interface Props {
  formData: FormData;
  isEditing: boolean;
  onChange: (field: keyof FormData, value: string) => void;
  onPortChange: (port: string) => void;
  onSecureChange: (checked: boolean) => void;
  onTlsChange: (checked: boolean) => void;
}

export function EmailIntegrationSmtpFields({
  formData, isEditing, onChange, onPortChange, onSecureChange, onTlsChange,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="smtp_host">Host SMTP</Label>
          <Input
            id="smtp_host"
            placeholder="Ex: smtp.gmail.com"
            value={formData.smtp_host}
            onChange={(e) => onChange("smtp_host", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="smtp_port">Porta</Label>
          <Select value={formData.smtp_port} onValueChange={onPortChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="465">465 (SSL)</SelectItem>
              <SelectItem value="587">587 (TLS)</SelectItem>
              <SelectItem value="2525">2525</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-3 rounded-md border bg-muted/30">
        <TooltipProvider>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="smtp_secure" className="text-sm cursor-pointer">SSL Direto</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="text-xs">Conexão SSL/TLS implícita desde o início. Usado normalmente na porta 465.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch id="smtp_secure" checked={formData.smtp_secure} onCheckedChange={onSecureChange} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="smtp_tls" className="text-sm cursor-pointer">STARTTLS</Label>
              <Tooltip>
                <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  <p className="text-xs">Inicia sem criptografia e faz upgrade para TLS. Usado normalmente na porta 587.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Switch id="smtp_tls" checked={formData.smtp_tls} onCheckedChange={onTlsChange} />
          </div>
        </TooltipProvider>
      </div>

      <div className="space-y-2">
        <Label htmlFor="smtp_user">Usuário SMTP</Label>
        <Input
          id="smtp_user"
          placeholder="Normalmente o próprio e-mail"
          value={formData.smtp_user}
          onChange={(e) => onChange("smtp_user", e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="smtp_password">Senha ou Token SMTP</Label>
        <div className="relative">
          <Input
            id="smtp_password"
            type={showPassword ? "text" : "password"}
            placeholder={isEditing ? "Deixe vazio para manter a senha atual" : "Senha de aplicativo ou token"}
            value={formData.smtp_password}
            onChange={(e) => onChange("smtp_password", e.target.value)}
            required={!isEditing}
            className="pr-10"
          />
          <Button
            type="button" variant="ghost" size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Para Gmail, use uma "Senha de App". Para Amazon SES, use as credenciais SMTP do IAM.
        </p>
      </div>
    </>
  );
}
