import { cn } from "@/lib/utils";

interface SkeletonCardProps {
  className?: string;
  lines?: number;
  showAvatar?: boolean;
  showImage?: boolean;
}

export function SkeletonCard({ className, lines = 3, showAvatar = false, showImage = false }: SkeletonCardProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse", className)}>
      {showImage && (
        <div className="h-32 w-full rounded-lg bg-muted shimmer" />
      )}
      <div className="flex items-center gap-3">
        {showAvatar && (
          <div className="h-10 w-10 rounded-full bg-muted shimmer flex-shrink-0" />
        )}
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-muted shimmer" />
          <div className="h-3 w-1/2 rounded bg-muted shimmer" />
        </div>
      </div>
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <div key={i} className={cn("h-3 rounded bg-muted shimmer", i % 2 === 0 ? "w-full" : "w-4/5")} />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, cols = 4, className }: SkeletonTableProps) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      {/* Header */}
      <div className="flex gap-4 p-4 border-b border-border bg-muted/30">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 rounded bg-muted shimmer flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 p-4 border-b border-border/50 last:border-0 animate-pulse">
          {Array.from({ length: cols }).map((_, col) => (
            <div key={col} className={cn("h-3 rounded bg-muted shimmer flex-1", col === 0 ? "w-2/5" : "")} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SkeletonStatsProps {
  count?: number;
  className?: string;
}

export function SkeletonStats({ count = 4, className }: SkeletonStatsProps) {
  return (
    <div className={cn("grid gap-4", `grid-cols-2 md:grid-cols-${count}`, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
          <div className="flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-muted shimmer" />
            <div className="h-8 w-8 rounded-lg bg-muted shimmer" />
          </div>
          <div className="h-7 w-24 rounded bg-muted shimmer" />
          <div className="h-2 w-16 rounded bg-muted shimmer" />
        </div>
      ))}
    </div>
  );
}
