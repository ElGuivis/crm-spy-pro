import { 
  LayoutDashboard, Plug, Settings, Headset, Zap, ChevronLeft, ChevronRight, ChevronDown,
  ShoppingCart, UserCircle, Package, Ticket, UsersRound, LogOut, Coins, Lock,
  Truck, Megaphone, Grid3X3, X, BookImage,
  Mail, Activity, Instagram
} from "lucide-react";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { SpyProLogo } from "@/components/common/SpyProLogo";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TokenBalance } from "@/components/tokens/TokenBalance";
import { useAuth } from "@/contexts/AuthContext";
import { useNewOrders } from "@/contexts/NewOrdersContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";

interface NavItem {
  icon: React.ElementType;
  label: string;
  href?: string;
  badgeKey?: 'sales' | 'conversations';
  adminOnly?: boolean;
  isSubItem?: boolean;
  permissionKey?: string;
  children?: NavItem[];
  isCollapsible?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", permissionKey: "dashboard" },
      { icon: Headset, label: "Atendimentos", href: "/atendimentos", permissionKey: "conversations" },
    ]
  },
  {
    label: "E-commerce",
    items: [
      { icon: ShoppingCart, label: "Vendas", href: "/sales", badgeKey: 'sales', permissionKey: "sales" },
      { icon: UserCircle, label: "Clientes", href: "/clients", permissionKey: "clients" },
      { icon: Grid3X3, label: "Matriz RFM", href: "/rfm", permissionKey: "dashboard" },
      { icon: Package, label: "Produtos", href: "/products", permissionKey: "products" },
      { icon: Ticket, label: "Cupons", href: "/coupons", permissionKey: "coupons" },
      { icon: Truck, label: "Envios", href: "/envios", permissionKey: "sales" },
      { icon: BookImage, label: "Catálogo WhatsApp", href: "/catalogo-whatsapp", permissionKey: "products" },
    ]
  },
  {
    label: "Comunicação",
    items: [
      { icon: Megaphone, label: "Disparos", href: "/disparos", permissionKey: "conversations" },
      { icon: Mail, label: "E-mail Marketing", href: "/email-marketing", permissionKey: "conversations" },
      
    ]
  },
  {
    label: "Automação",
    items: [
      { icon: Zap, label: "Pós Venda", href: "/automations", permissionKey: "automations" },
      { icon: Instagram, label: "Instagram", href: "/instagram", permissionKey: "conversations" },
    ]
  },
  {
    label: "Sistema",
    items: [
      { icon: Plug, label: "Integrações", href: "/integrations", permissionKey: "integrations" },
      { icon: Coins, label: "Tokens", href: "/tokens", adminOnly: true },
      { icon: UsersRound, label: "Equipe", href: "/team", adminOnly: true },
      { icon: Activity, label: "Operações", href: "/operations", adminOnly: true },
      { icon: Settings, label: "Configurações", href: "/settings", permissionKey: "settings" },
    ]
  }
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, profile, signOut, isOwner, isAdmin, permissions } = useAuth();
  const { newOrdersCount, markAllAsSeen } = useNewOrders();
  const isMobile = useIsMobile();


  // Auto-close sidebar on route change (mobile)
  useEffect(() => {
    if (isMobile && onMobileClose) {
      onMobileClose();
    }
  }, [currentPath]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentPath === '/sales' && newOrdersCount > 0) {
      markAllAsSeen();
    }
  }, [currentPath, newOrdersCount, markAllAsSeen]);

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  const getUserInitials = () => {
    if (profile?.company_name) return profile.company_name.substring(0, 2).toUpperCase();
    if (user?.email) return user.email.substring(0, 2).toUpperCase();
    return 'U';
  };

  const getBadgeCount = (badgeKey?: 'sales' | 'conversations'): number | undefined => {
    if (badgeKey === 'sales') return newOrdersCount > 0 ? newOrdersCount : undefined;
    return undefined;
  };

  const hasPermission = (item: NavItem): boolean => {
    if (isOwner || isAdmin) return true;
    if (!item.permissionKey) return true;
    return permissions.includes(item.permissionKey as any);
  };

  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.adminOnly) return isOwner || isAdmin;
      return true;
    })
  })).filter(group => group.items.length > 0);

  const toggleExpanded = (label: string) => {
    setExpandedItems(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isChildActive = (item: NavItem): boolean => {
    if (!item.children) return false;
    return item.children.some(child => child.href === currentPath);
  };

  const renderNavItem = (item: NavItem, showLabel: boolean = true, depth: number = 0) => {
    const allowed = hasPermission(item);
    const isActive = item.href === currentPath;
    const hasChildren = item.isCollapsible && item.children && item.children.length > 0;
    const isExpanded = expandedItems[item.label] || false;
    const childActive = isChildActive(item);
    
    if (!allowed) {
      return (
        <div key={item.label} className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/40 cursor-not-allowed",
          depth > 0 && "pl-8"
        )}>
          <item.icon className="h-5 w-5 shrink-0" />
          {showLabel && <span className="flex-1">{item.label}</span>}
          {showLabel && <Lock className="h-3.5 w-3.5 shrink-0" />}
        </div>
      );
    }

    if (hasChildren) {
      return (
        <Collapsible key={item.label} open={isExpanded} onOpenChange={() => toggleExpanded(item.label)}>
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                childActive
                  ? "bg-sidebar-primary/10 text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:scale-[1.02]"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", childActive && "text-sidebar-primary")} />
              {showLabel && <span className="flex-1 text-left">{item.label}</span>}
              {showLabel && (
                <ChevronDown className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isExpanded && "rotate-180"
                )} />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 mt-0.5">
            {item.children?.map(child => renderNavItem(child, showLabel, depth + 1))}
          </CollapsibleContent>
        </Collapsible>
      );
    }
    
    return (
      <Link
        key={item.href || item.label}
        to={item.href!}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200",
          depth > 0 ? "pl-11 pr-3" : "px-3",
          isActive
            ? "bg-sidebar-primary/10 text-sidebar-primary border-l-[3px] border-sidebar-primary ml-0" + (depth > 0 ? " pl-[38px]" : " pl-[9px]")
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:scale-[1.02]"
        )}
      >
        <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-sidebar-primary")} />
        {showLabel && <span>{item.label}</span>}
        {(() => {
          const badge = getBadgeCount(item.badgeKey);
          return badge && showLabel && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold animate-pulse bg-primary text-primary-foreground">
              {badge > 99 ? '99+' : badge}
            </span>
          );
        })()}
      </Link>
    );
  };

  // Mobile: overlay drawer
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
        )}

        {/* Drawer */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 h-screen w-72 bg-sidebar border-r border-sidebar-border flex flex-col",
            "transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Header */}
          <div className="flex h-14 items-center justify-between px-4 border-b border-sidebar-border">
            <Link to="/" className="flex items-center gap-3">
              <SpyProLogo size="md" showText />
            </Link>
            <Button variant="ghost" size="icon" onClick={onMobileClose} className="text-sidebar-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tenant Switcher (mobile) */}
          <div className="p-3 border-b border-sidebar-border">
            <TenantSwitcher />
          </div>

          {/* Token Balance */}
          <Link to="/tokens" className="block p-3 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors">
            <TokenBalance variant="sidebar" />
          </Link>

          {/* Nav */}
          <nav className="flex-1 space-y-4 p-3 overflow-y-auto">
            {filteredGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">{group.label}</p>
                <div className="space-y-0.5">
                  {group.items.map((item) => renderNavItem(item, true))}
                </div>
              </div>
            ))}
          </nav>

          {/* User section */}
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="h-9 w-9 rounded-full gradient-whatsapp flex items-center justify-center text-primary-foreground font-semibold text-sm">
                {getUserInitials()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-sidebar-accent-foreground truncate">
                  {profile?.company_name || user?.email?.split('@')[0] || 'Usuário'}
                </p>
                <p className="text-xs text-sidebar-foreground">
                  {isOwner ? 'Proprietário' : isAdmin ? 'Admin' : 'Membro'}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-sidebar-foreground hover:text-destructive hover:bg-destructive/10">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      </>
    );
  }

  // Desktop: original sidebar
  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out",
        "bg-sidebar border-r border-sidebar-border flex flex-col",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-sidebar-border">
        <Link to="/" className={cn("flex items-center gap-3 transition-opacity duration-200", collapsed && "opacity-0 pointer-events-none")}>
          <SpyProLogo size="lg" showText />
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)} className="text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Tenant Switcher (desktop) */}
      <div className={cn("p-3 border-b border-sidebar-border", collapsed && "px-2")}>
        <TenantSwitcher collapsed={collapsed} />
      </div>

      {/* Token Balance */}
      {!collapsed && (
        <Link to="/tokens" className="block p-3 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors">
          <TokenBalance variant="sidebar" />
        </Link>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-4 p-3 overflow-y-auto">
        {filteredGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const allowed = hasPermission(item);
                if (!allowed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>
                        <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/40 cursor-not-allowed select-none">
                          <item.icon className="h-5 w-5 shrink-0" />
                          <span className={cn("transition-opacity duration-200 flex-1", collapsed && "opacity-0 w-0 overflow-hidden")}>{item.label}</span>
                          {!collapsed && <Lock className="h-3.5 w-3.5 shrink-0" />}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right"><p>Acesso restrito</p></TooltipContent>
                    </Tooltip>
                  );
                }
                return renderNavItem(item, !collapsed);
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2", collapsed && "justify-center")}>
          <div className="relative h-9 w-9 rounded-full gradient-whatsapp flex items-center justify-center text-primary-foreground font-semibold text-sm">
            {getUserInitials()}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-primary border-2 border-sidebar" />
          </div>
          <div className={cn("flex-1 transition-opacity duration-200", collapsed && "hidden")}>
            <p className="text-sm font-medium text-sidebar-accent-foreground truncate">
              {profile?.company_name || user?.email?.split('@')[0] || 'Usuário'}
            </p>
            <p className="text-xs text-sidebar-foreground">
              {isOwner ? 'Proprietário' : isAdmin ? 'Admin' : 'Membro'}
            </p>
          </div>
          {!collapsed && (
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-sidebar-foreground hover:text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
        {collapsed && (
          <Button variant="ghost" size="icon" onClick={handleLogout} className="w-full mt-2 text-sidebar-foreground hover:text-destructive hover:bg-destructive/10">
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </aside>
  );
}
