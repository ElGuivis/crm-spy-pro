import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  Trash2,
  UserX,
  XCircle,
  AlertTriangle,
  Ban,
  Mail,
  Loader2,
} from "lucide-react";
import { useSuppressionList, SuppressionReason, SuppressionEntry } from "@/hooks/useSuppressionList";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/common/EmptyState";

const reasonConfig: Record<SuppressionReason, { label: string; icon: React.ElementType; className: string }> = {
  unsubscribed: { label: "Descadastro", icon: UserX, className: "bg-secondary" },
  bounced: { label: "Bounce", icon: XCircle, className: "bg-destructive/10 text-destructive" },
  complained: { label: "Reclamação", icon: AlertTriangle, className: "bg-yellow-100 text-yellow-800" },
  invalid: { label: "Inválido", icon: Mail, className: "bg-secondary text-muted-foreground" },
  blocked: { label: "Bloqueado", icon: Ban, className: "bg-destructive/10 text-destructive" },
};

export function SuppressionListManager() {
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState<SuppressionReason | "">("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SuppressionEntry | null>(null);

  // Form state
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState<SuppressionReason>("blocked");

  const { entries, counts, isLoading, addEmail, removeEmail } = useSuppressionList({
    reason: reasonFilter || undefined,
    search: search || undefined,
  });

  const handleAddEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) return;
    await addEmail.mutateAsync({ email: newEmail, reason: newReason, source: "manual" });
    setNewEmail("");
    setAddDialogOpen(false);
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    await removeEmail.mutateAsync(removeTarget.id);
    setRemoveTarget(null);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{counts.total}</div>
            </CardContent>
          </Card>
          {(Object.keys(reasonConfig) as SuppressionReason[]).map((reason) => {
            const config = reasonConfig[reason];
            const count = counts[reason] || 0;
            return (
              <Card key={reason}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
                  <config.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{count}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filters and table */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por e-mail…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={reasonFilter || "__none__"}
                onValueChange={(v) => setReasonFilter(v === "__none__" ? "" : v as SuppressionReason | "")}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todos os motivos</SelectItem>
                  {(Object.keys(reasonConfig) as SuppressionReason[]).map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reasonConfig[reason].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={Mail}
                title={search || reasonFilter ? "Nenhum resultado" : "Lista de supressão vazia"}
                description={
                  search || reasonFilter
                    ? "Tente ajustar os filtros"
                    : "E-mails que não devem receber campanhas aparecerão aqui."
                }
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Fonte</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const config = reasonConfig[entry.reason] || {
                        label: entry.reason,
                        className: "bg-secondary",
                      };
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-sm">{entry.email}</TableCell>
                          <TableCell>
                            <Badge className={config.className}>{config.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.source || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setRemoveTarget(entry)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Lista de Supressão</DialogTitle>
            <DialogDescription>
              E-mails nesta lista não receberão futuras campanhas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo</Label>
              <Select value={newReason} onValueChange={(v) => setNewReason(v as SuppressionReason)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(reasonConfig) as SuppressionReason[]).map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reasonConfig[reason].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddEmail}
              disabled={!newEmail.trim() || !newEmail.includes("@") || addEmail.isPending}
            >
              {addEmail.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover da lista de supressão?</AlertDialogTitle>
            <AlertDialogDescription>
              O e-mail <strong>{removeTarget?.email}</strong> poderá receber campanhas novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeEmail.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveConfirm} disabled={removeEmail.isPending}>
              {removeEmail.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
