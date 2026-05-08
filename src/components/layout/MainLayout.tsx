import { ReactNode, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NotificationDropdown } from "@/components/layout/NotificationDropdown";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/common/PageTransition";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { ChangelogDialog } from "@/components/help/ChangelogDialog";

interface MainLayoutProps {
  children: ReactNode;
}

const FULLSCREEN_ROUTES = ['/atendimentos'];

export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const isFullscreen = FULLSCREEN_ROUTES.includes(location.pathname);
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Nav Header */}
      {isMobile && !isFullscreen && (
        <MobileNav onMenuToggle={() => setMobileMenuOpen(true)} />
      )}

      {/* Sidebar */}
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      
      {/* Main Content */}
      <main className={cn(
        "transition-all duration-300",
        isMobile ? (isFullscreen ? "" : "pt-14") : "pl-64"
      )}>
        {/* Desktop Header - hidden on mobile and fullscreen routes */}
        {!isFullscreen && !isMobile && (
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <div className="flex items-center gap-4" />
            <div className="flex items-center gap-3">
              <GlobalSearch />
              <ChangelogDialog />
              <NotificationDropdown />
            </div>
          </header>
        )}

        {/* Page Content with transition */}
        <div className={isFullscreen 
          ? (isMobile ? "h-[calc(100vh-3.5rem)]" : "h-screen") 
          : "p-4 md:p-6"
        }>
          {isFullscreen ? children : (
            <PageTransition>
              {children}
            </PageTransition>
          )}
        </div>
      </main>
      <OnboardingTour />
    </div>
  );
}
