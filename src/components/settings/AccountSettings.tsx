import { useState, useEffect } from "react";
import { User, Building2, KeyRound, Mail, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

import { createLogger } from '@/lib/logger';
const log = createLogger('AccountSettings');

export function AccountSettings() {
  const { user, profile } = useAuth();
  const [ownerName, setOwnerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setCompanyName(profile.company_name || "");
      // owner_name isn't in the typed profile yet, fetch it
      fetchOwnerName();
    }
  }, [profile]);

  const fetchOwnerName = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("owner_name")
      .eq("user_id", user.id)
      .single();
    if (data && (data as any).owner_name) {
      setOwnerName((data as any).owner_name);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          company_name: companyName,
          owner_name: ownerName,
        } as any)
        .eq("user_id", user.id);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
    } catch (error) {
      log.error(error);
      toast.error("Erro ao salvar perfil");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) {
      toast.error("Informe a senha atual");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    setIsChangingPassword(true);
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      if (signInError) {
        toast.error("Senha atual incorreta");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      log.error(error);
      toast.error(error.message || "Erro ao alterar senha");
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-card-foreground">Minha Conta</h2>
        <p className="text-sm text-muted-foreground">Gerencie suas informações pessoais e de acesso</p>
      </div>

      {/* Email (read-only) */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email
        </label>
        <Input value={user?.email || ""} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">O email não pode ser alterado</p>
      </div>

      {/* Owner Name */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <User className="h-4 w-4 text-muted-foreground" />
          Nome do Proprietário
        </label>
        <Input
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          placeholder="Seu nome completo"
        />
      </div>

      {/* Company Name */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Nome da Empresa
        </label>
        <Input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Nome da sua empresa"
        />
      </div>

      <Button onClick={handleSaveProfile} disabled={isSaving} className="gap-2">
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar Alterações
      </Button>

      {/* Change Password */}
      <div className="border-t border-border pt-6 space-y-4">
        <div>
          <h3 className="flex items-center gap-2 font-medium text-card-foreground">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Alterar Senha
          </h3>
          <p className="text-sm text-muted-foreground">Defina uma nova senha para sua conta</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-card-foreground">Senha Atual</label>
          <Input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Digite sua senha atual"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-card-foreground">Nova Senha</label>
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-card-foreground">Confirmar Nova Senha</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repita a nova senha"
          />
        </div>

        <Button
          onClick={handleChangePassword}
          disabled={isChangingPassword || !currentPassword || !newPassword || !confirmPassword}
          variant="outline"
          className="gap-2"
        >
          {isChangingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Alterar Senha
        </Button>
      </div>
    </div>
  );
}
