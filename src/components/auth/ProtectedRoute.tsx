import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Map routes to required permission keys
const routePermissionMap: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/atendimentos': 'conversations',
  '/sales': 'sales',
  '/clients': 'clients',
  '/products': 'products',
  '/rfm': 'dashboard',
  '/integrations': 'integrations',
  '/meta': 'integrations',
  '/envios': 'sales',
  '/automations': 'automations',
  '/disparos': 'conversations',
  '/coupons': 'coupons',
  '/settings': 'settings',
  '/email-marketing': 'automations',
  '/catalogo-whatsapp': 'products',
  '/instagram-inbox': 'conversations',
  '/instagram-automations': 'automations',
  '/instagram-growth': 'automations',
  '/instagram-social-care': 'conversations',
  '/instagram-reports': 'dashboard',
  '/instagram-calendar': 'automations',
  '/unified-inbox': 'conversations',
  '/crm-advanced': 'clients',
  '/api-webhooks': 'integrations',
  '/white-label': 'settings',
  '/team': 'settings',
  '/tokens': 'settings',
};

// Permission to default route mapping (first allowed route)
const permissionToRoute: Record<string, string> = {
  'dashboard': '/dashboard',
  'conversations': '/atendimentos',
  'sales': '/sales',
  'clients': '/clients',
  'products': '/products',
  'integrations': '/integrations',
  'automations': '/automations',
  'coupons': '/coupons',
  'settings': '/settings',
};

function getFirstAllowedRoute(permissions: string[]): string {
  for (const perm of permissions) {
    const route = permissionToRoute[perm];
    if (route) return route;
  }
  return '/dashboard';
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading, permissions, isOwner, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check route permission (owners/admins bypass)
  if (!isOwner && !isAdmin) {
    const basePath = '/' + location.pathname.split('/')[1];
    const requiredPermission = routePermissionMap[basePath];

    if (requiredPermission && !permissions.includes(requiredPermission as any)) {
      const firstAllowed = getFirstAllowedRoute(permissions);

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <ShieldX className="w-16 h-16 text-muted-foreground" />
            <h1 className="text-2xl font-bold text-foreground">Acesso Restrito</h1>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta área. Entre em contato com o administrador da sua equipe.
            </p>
            <Button onClick={() => navigate(firstAllowed)}>
              Ir para área permitida
            </Button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
