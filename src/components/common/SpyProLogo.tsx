import React from "react";
import { cn } from "@/lib/utils";
import logoSpyPro from "@/assets/logo_spypro.png";

const sizes = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-8 w-8",
  xl: "h-10 w-10",
} as const;

const textSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
} as const;

interface SpyProLogoProps {
  size?: keyof typeof sizes;
  showText?: boolean;
  className?: string;
}

export const SpyProLogo = React.memo(function SpyProLogo({
  size = "md",
  showText = false,
  className,
}: SpyProLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 shrink-0", className)}>
      <span
        className={cn(
          "relative inline-flex items-center justify-center rounded-2xl shrink-0",
          sizes[size]
        )}
        style={{
          background: "linear-gradient(145deg, hsl(142 70% 50% / 0.15), hsl(142 70% 35% / 0.08))",
          boxShadow: `
            0 0 0 1px hsl(142 70% 45% / 0.15),
            0 4px 16px -2px hsl(142 70% 40% / 0.3),
            0 8px 32px -4px hsl(142 70% 40% / 0.15),
            inset 0 1px 0 hsl(0 0% 100% / 0.1)
          `,
        }}
      >
        <img
          src={logoSpyPro}
          alt="SpyPro"
          className={cn(
            "rounded-xl object-contain",
            sizes[size]
          )}
          style={{
            filter: "drop-shadow(0 2px 8px hsl(142 70% 40% / 0.4))",
          }}
        />
        {/* Glass reflection overlay */}
        <span
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            background: "linear-gradient(170deg, hsl(0 0% 100% / 0.25) 0%, transparent 50%)",
          }}
        />
      </span>

      {showText && (
        <span className={cn("font-bold tracking-tight text-primary-foreground", textSizes[size])}>
          SpyPro
        </span>
      )}
    </span>
  );
});
