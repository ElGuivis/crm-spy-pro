import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  variant?: "default" | "success" | "warning" | "destructive";
  showWebhookWarning?: boolean;
}

const variantStyles = {
  default: "text-muted-foreground",
  success: "text-primary",
  warning: "text-yellow-600",
  destructive: "text-destructive",
};

export function MetricCard({ title, value, description, icon: Icon, variant = "default", showWebhookWarning }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", variantStyles[variant])} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        {showWebhookWarning && (
          <div className="flex items-center gap-1 mt-1.5">
            <Info className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Requer webhooks</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
