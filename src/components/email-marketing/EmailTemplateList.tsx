import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreVertical, Edit, Copy, Trash2, FileText, Loader2 } from "lucide-react";
import {
  useEmailTemplates,
  useDeleteEmailTemplate,
  useDuplicateEmailTemplate,
  EmailTemplate,
} from "@/hooks/useEmailTemplates";
import { EmptyState } from "@/components/common/EmptyState";

interface EmailTemplateListProps {
  onEdit: (id: string) => void;
}

export function EmailTemplateList({ onEdit }: EmailTemplateListProps) {
  const { data: templates, isLoading } = useEmailTemplates();
  const deleteMutation = useDeleteEmailTemplate();
  const duplicateMutation = useDuplicateEmailTemplate();
  const [deleteTarget, setDeleteTarget] = useState<EmailTemplate | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleDuplicate = async (id: string) => {
    if (pendingId) return;
    setPendingId(`dup-${id}`);
    try {
      await duplicateMutation.mutateAsync(id);
    } finally {
      setPendingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setPendingId(`del-${deleteTarget.id}`);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
    } finally {
      setPendingId(null);
      setDeleteTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-32 w-full mb-4" />
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum template criado ainda"
        description="Crie templates reutilizáveis para agilizar a criação de campanhas."
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => {
          const isActing = pendingId?.endsWith(template.id);
          return (
            <Card
              key={template.id}
              className={`hover:shadow-md transition-shadow ${isActing ? 'opacity-60' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="mt-1 line-clamp-2">
                        {template.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={!!isActing}>
                        {isActing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreVertical className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(template.id)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDuplicate(template.id)}
                        disabled={!!pendingId}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(template)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {template.content_html ? (
                  <div className="rounded border bg-muted/30 p-3 min-h-[100px] text-xs overflow-hidden pointer-events-none select-none line-clamp-6 text-muted-foreground">
                    {(() => {
                      try {
                        const doc = new DOMParser().parseFromString(template.content_html, 'text/html');
                        return doc.body.textContent?.substring(0, 300) || 'Sem conteúdo de texto';
                      } catch {
                        return template.content_html.replace(/<[^>]*>/g, '').substring(0, 300);
                      }
                    })()}
                  </div>
                ) : (
                  <div className="rounded border bg-muted/30 p-3 min-h-[100px] flex items-center justify-center text-xs text-muted-foreground">
                    Sem prévia disponível
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => onEdit(template.id)}
                >
                  <Edit className="h-3.5 w-3.5 mr-2" />
                  Editar Template
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              O template <strong>"{deleteTarget?.name}"</strong> será excluído permanentemente. Campanhas existentes que o utilizam não serão afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!pendingId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={!!pendingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pendingId?.startsWith('del') && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
