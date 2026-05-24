import type { ComponentType } from "react";

interface InfoItemProps {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

export function InfoItem({ icon: Icon, label, value }: InfoItemProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="font-medium text-sm truncate" title={value}>{value}</p>
    </div>
  );
}
