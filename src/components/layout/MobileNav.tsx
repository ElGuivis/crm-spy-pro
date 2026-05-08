import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { SpyProLogo } from "@/components/common/SpyProLogo";

interface MobileNavProps {
  onMenuToggle: () => void;
}

export function MobileNav({ onMenuToggle }: MobileNavProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 safe-area-top md:hidden">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuToggle}
        className="touch-target"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <SpyProLogo size="sm" showText />
      </div>

      <NotificationDropdown />
    </header>
  );
}
