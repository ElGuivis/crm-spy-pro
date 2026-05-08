import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SkeletonConversationProps {
  count?: number;
  className?: string;
}

export const SkeletonConversation = forwardRef<HTMLDivElement, SkeletonConversationProps>(
  ({ count = 6, className }, ref) => {
    return (
      <div ref={ref} className={cn("divide-y divide-border", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-muted shimmer flex-shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="h-3.5 w-28 rounded bg-muted shimmer" />
                <div className="h-3 w-10 rounded bg-muted shimmer flex-shrink-0" />
              </div>
              <div className="h-3 w-4/5 rounded bg-muted shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }
);
SkeletonConversation.displayName = "SkeletonConversation";
