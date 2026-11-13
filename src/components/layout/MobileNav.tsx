import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { SpyProLogo } from "@/components/common/SpyProLogo";

interface MobileNavProps {
  onMenuToggle: () => void;
}

export function MobileNav({ onMenuToggle }: MobileNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar text-sidebar-foreground px-4 safe-area-top md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuToggle}
        className="touch-target text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <SpyProLogo size="sm" showText />
      </div>

      <div className="[&_svg]:text-sidebar-foreground [&_button:hover]:bg-sidebar-accent"><NotificationDropdown /></div>
    </header>
  );
}
