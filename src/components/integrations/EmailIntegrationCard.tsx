import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mail, MoreVertical, Edit, Trash2 } from "lucide-react";
import { TestEmailButton } from "./TestEmailButton";
import type { EmailIntegration } from "./integrationsHelpers";

interface Props {
  email: EmailIntegration;
  onEdit: (email: EmailIntegration) => void;
  onDelete: (id: string) => void;
}

export function EmailIntegrationCard({ email, onEdit, onDelete }: Props) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
              <Mail className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <CardTitle className="text-base">{email.name}</CardTitle>
              <CardDescription className="text-xs">{email.sender_email}</CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(email)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(email.id)} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Remover
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="font-mono">
              {email.smtp_host}:{email.smtp_port}
            </Badge>
            <Badge variant={email.is_active ? "default" : "outline"}>
              {email.is_active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
          <TestEmailButton emailIntegrationId={email.id} disabled={!email.is_active} />
        </div>
      </CardContent>
    </Card>
  );
}
