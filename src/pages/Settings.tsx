import { Trash2, Loader2, Users, ShoppingCart, Package, AlertTriangle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
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

import { createLogger } from '@/lib/logger';
const log = createLogger('Settings');

const SettingsPage = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Gerencie os dados do sistema</p>
      </div>

      <div className="rounded-xl bg-card p-6 border border-border/50">
        <AccountSettings />
      </div>

      <div className="rounded-xl bg-card p-6 border border-border/50">
        <NotificationSettings />
      </div>

      <div className="rounded-xl bg-card p-6 border border-border/50">
        <DataSettings />
      </div>

      <div className="rounded-xl bg-card p-6 border border-destructive/30">
        <DeleteAccountSection />
      </div>
    </div>
  );
};

function DataSettings() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"customers" | "orders" | "products" | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteConfig = {
    customers: {
      title: "Excluir todos os clientes",
      description: "Todos os dados de clientes serão removidos permanentemente. Esta ação não pode ser desfeita.",
      table: "li_customers",
      icon: Users,
      label: "Clientes"
    },
    orders: {
      title: "Excluir todas as vendas",
      description: "Todos os pedidos e itens serão removidos permanentemente. Esta ação não pode ser desfeita.",
      tables: ["li_order_items", "li_orders"],
      icon: ShoppingCart,
      label: "Vendas"
    },
    products: {
      title: "Excluir todos os produtos",
      description: "Todos os dados de produtos serão removidos permanentemente. Esta ação não pode ser desfeita.",
      table: "li_products",
      icon: Package,
      label: "Produtos"
    }
  };

  const handleDeleteClick = (type: "customers" | "orders" | "products") => {
    setDeleteType(type);
    setDeleteDialogOpen(true);
  };

  const deleteBatched = async (table: string) => {
    while (true) {
      const { data, error: selErr } = await supabase.from(table as any).select('id').limit(500);
      if (selErr) throw selErr;
      if (!data || data.length === 0) break;
      const ids = data.map((r: any) => r.id);
      const { error } = await supabase.from(table as any).delete().in('id', ids);
      if (error) throw error;
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteType) return;

    setIsDeleting(true);

    try {
      if (deleteType === "orders") {
        await deleteBatched("li_order_items");
        await deleteBatched("li_orders");
      } else {
        const table = deleteType === "customers" ? "li_customers" : "li_products";
        await deleteBatched(table);
      }

      toast.success(`${deleteConfig[deleteType].label} excluídos com sucesso!`);
    } catch (error) {
      log.error("Error deleting data:", error);
      toast.error("Erro ao excluir dados");
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteType(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-card-foreground">Gerenciamento de Dados</h2>
        <p className="text-sm text-muted-foreground">Exclua dados sincronizados da Loja Integrada</p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Clientes</h3>
                <p className="text-sm text-muted-foreground">Exclui todos os clientes sincronizados</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => handleDeleteClick("customers")}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Vendas</h3>
                <p className="text-sm text-muted-foreground">Exclui todos os pedidos e itens sincronizados</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => handleDeleteClick("orders")}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Produtos</h3>
                <p className="text-sm text-muted-foreground">Exclui todos os produtos sincronizados</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => handleDeleteClick("products")}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
        <p className="text-sm text-warning-foreground">
          <strong>Atenção:</strong> Estas ações são irreversíveis. Os dados serão permanentemente excluídos do sistema.
        </p>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteType && deleteConfig[deleteType].title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteType && deleteConfig[deleteType].description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button 
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteAccountSection() {
  const { tenant, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<string[]>([]);

  const isOwner = tenant?.owner_id === user?.id;
  const CONFIRM_TEXT = isOwner ? "EXCLUIR MINHA CONTA" : "SAIR DAS EQUIPES";

  const handleAction = async () => {
    if (confirmText !== CONFIRM_TEXT) return;

    setIsDeleting(true);
    setDeletionProgress([]);

    const addProgress = (msg: string) => {
      setDeletionProgress(prev => [...prev, msg]);
    };

    try {
      addProgress("Conectando ao servidor...");

      const mode = isOwner ? "delete_owned_account" : "leave_teams";

      const { data, error } = await supabase.functions.invoke("delete-account", {
        body: { mode },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.logs) {
        data.logs.forEach((log: string) => addProgress(log));
      }

      if (!data?.success) {
        throw new Error(data?.error || "Erro desconhecido");
      }

      if (isOwner) {
        toast.success("Conta excluída com sucesso!");
        localStorage.clear();
        sessionStorage.clear();
        navigate("/auth");
      } else {
        toast.success("Você saiu de todas as equipes!");
        // Sign out since member has no tenant access anymore
        await signOut();
        navigate("/auth");
      }

    } catch (error) {
      log.error("Error:", error);
      toast.error(isOwner ? "Erro ao excluir conta. Tente novamente." : "Erro ao sair das equipes. Tente novamente.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-destructive">Zona de Perigo</h2>
          <p className="text-sm text-muted-foreground">Ações irreversíveis que afetam toda a conta</p>
        </div>
      </div>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              {isOwner ? <Trash2 className="h-5 w-5 text-destructive" /> : <LogOut className="h-5 w-5 text-destructive" />}
            </div>
            <div>
              <h3 className="font-medium text-destructive">
                {isOwner ? "Excluir Conta" : "Sair de Todas as Equipes"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isOwner
                  ? "Remove permanentemente todos os dados: vendas, clientes, produtos, conversas, integrações, configurações e membros da equipe."
                  : "Remove você de todas as equipes das quais é membro. Sua conta de autenticação será mantida."}
              </p>
            </div>
          </div>
          <Button 
            variant="destructive" 
            size="sm"
            className="gap-2"
            onClick={() => setDialogOpen(true)}
          >
            {isOwner ? <Trash2 className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
            {isOwner ? "Excluir Conta" : "Sair das Equipes"}
          </Button>
        </div>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {isOwner ? "Excluir Conta Permanentemente" : "Sair de Todas as Equipes"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {isOwner ? (
                <>
                  <p>
                    Esta ação é <strong>irreversível</strong>. Todos os seus dados serão 
                    permanentemente excluídos, incluindo:
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-sm">
                    <li>Todas as vendas e pedidos</li>
                    <li>Todos os clientes e leads</li>
                    <li>Todos os produtos</li>
                    <li>Todo o histórico de conversas</li>
                    <li>Todas as integrações</li>
                    <li>Todas as configurações</li>
                    <li>Todos os membros da equipe</li>
                  </ul>
                </>
              ) : (
                <p>
                  Você será removido de todas as equipes das quais participa. 
                  Perderá acesso a todos os dados compartilhados. Esta ação não pode ser desfeita.
                </p>
              )}
              <div className="pt-2">
                <p className="text-sm font-medium mb-2">
                  Digite <strong className="text-destructive">{CONFIRM_TEXT}</strong> para confirmar:
                </p>
                <Input 
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_TEXT}
                  disabled={isDeleting}
                />
              </div>
              {isDeleting && deletionProgress.length > 0 && (
                <div className="mt-4 max-h-32 overflow-y-auto rounded bg-muted p-2 text-xs font-mono">
                  {deletionProgress.map((msg, i) => (
                    <div key={i}>{msg}</div>
                  ))}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <Button 
              onClick={handleAction}
              disabled={isDeleting || confirmText !== CONFIRM_TEXT}
              variant="destructive"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isOwner ? "Excluindo..." : "Saindo..."}
                </>
              ) : (
                <>
                  {isOwner ? <Trash2 className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
                  {isOwner ? "Excluir Minha Conta" : "Sair das Equipes"}
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SettingsPage;