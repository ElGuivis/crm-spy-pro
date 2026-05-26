import { Checkbox } from '@/components/ui/checkbox';
import { Eye, Edit } from 'lucide-react';

export type ModulePermission = 'dashboard' | 'sales' | 'clients' | 'conversations' | 'automations' | 'integrations' | 'coupons' | 'products' | 'contacts' | 'settings' | 'tenants';

export const MODULES: { id: ModulePermission; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'sales', label: 'Vendas' },
  { id: 'clients', label: 'Clientes' },
  { id: 'conversations', label: 'Conversas' },
  { id: 'automations', label: 'Automações' },
  { id: 'integrations', label: 'Integrações' },
  { id: 'coupons', label: 'Cupons' },
  { id: 'products', label: 'Produtos' },
  { id: 'contacts', label: 'Contatos' },
  { id: 'settings', label: 'Configurações' },
];

interface Props {
  permissions: Record<string, { view: boolean; edit: boolean }>;
  onPermissionChange: (module: string, type: 'view' | 'edit', checked: boolean) => void;
}

export function PermissionsGrid({ permissions, onPermissionChange }: Props) {
  return (
    <div className="border rounded-lg divide-y">
      {MODULES.map((module) => (
        <div key={module.id} className="flex items-center justify-between p-3">
          <span className="text-sm font-medium">{module.label}</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={permissions[module.id]?.view ?? false}
                onCheckedChange={(checked) => onPermissionChange(module.id, 'view', !!checked)}
              />
              <Eye className="w-4 h-4" />
              Ver
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={permissions[module.id]?.edit ?? false}
                disabled={!permissions[module.id]?.view}
                onCheckedChange={(checked) => onPermissionChange(module.id, 'edit', !!checked)}
              />
              <Edit className="w-4 h-4" />
              Editar
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
