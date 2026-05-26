import {
  LayoutDashboard, Plug, Settings, Headset, Zap,
  ShoppingCart, UserCircle, Package, Ticket, UsersRound, Coins,
  Truck, Megaphone, Grid3X3, BookImage, Mail, Activity, Instagram, Star,
} from "lucide-react";

export interface NavItem {
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

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
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
      { icon: Star, label: "Fidelidade", href: "/fidelidade", permissionKey: "coupons" },
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
