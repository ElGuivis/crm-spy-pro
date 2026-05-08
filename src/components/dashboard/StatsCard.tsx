import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  className?: string;
}

export function StatsCard({ 
  title, 
  value, 
  change, 
  changeType = "neutral",
  icon: Icon,
  className 
}: StatsCardProps) {
  return (
    <div className={cn(
      "card-premium group p-5",
      className
    )}>
      {/* Background glow */}
      <div className={cn(
        "absolute -right-6 -top-6 h-24 w-24 rounded-full transition-transform duration-500 group-hover:scale-[2]",
        changeType === "positive" && "bg-primary/5",
        changeType === "negative" && "bg-destructive/5",
        changeType === "neutral" && "bg-muted/50"
      )} />
      
      <div className="relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-card-foreground">
              {value}
            </p>
            {change && (
              <p className={cn(
                "text-xs font-medium",
                changeType === "positive" && "text-primary",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}>
                {change}
              </p>
            )}
          </div>
          
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-300",
            changeType === "positive" && "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground",
            changeType === "negative" && "bg-destructive/10 text-destructive group-hover:bg-destructive group-hover:text-destructive-foreground",
            changeType === "neutral" && "bg-muted text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground"
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
