import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface TenantSwitcherProps {
  collapsed?: boolean;
}

export function TenantSwitcher({ collapsed = false }: TenantSwitcherProps) {
  const { tenant, availableTenants, isMultiTenant, switchTenant } = useAuth();

  // Only render if user has multiple tenants
  if (!isMultiTenant) return null;

  const handleSwitch = async (tenantId: string) => {
    if (tenantId === tenant?.id) return;

    const success = await switchTenant(tenantId);
    if (success) {
      toast.success("Empresa alterada com sucesso");
    } else {
      toast.error("Erro ao trocar de empresa");
    }
  };

  const currentName = tenant?.name || "Selecionar empresa";

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="w-full h-9">
            <Building2 className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" className="w-56">
          {availableTenants.map((t) => (
            <DropdownMenuItem
              key={t.tenant_id}
              onClick={() => handleSwitch(t.tenant_id)}
              className="flex items-center justify-between"
            >
              <span className="truncate">{t.tenant_name}</span>
              {t.tenant_id === tenant?.id && <Check className="h-4 w-4 ml-2 shrink-0" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between h-9 px-3 text-sm font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{currentName}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
        {availableTenants.map((t) => (
          <DropdownMenuItem
            key={t.tenant_id}
            onClick={() => handleSwitch(t.tenant_id)}
            className="flex items-center justify-between"
          >
            <div className="flex flex-col min-w-0">
              <span className="truncate">{t.tenant_name}</span>
              <span className="text-xs text-muted-foreground capitalize">{t.role}</span>
            </div>
            {t.tenant_id === tenant?.id && <Check className="h-4 w-4 ml-2 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
