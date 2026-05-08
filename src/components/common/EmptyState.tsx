import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction, 
  className,
  secondaryActionLabel,
  onSecondaryAction,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("flex flex-col items-center justify-center py-16 text-center", className)}
    >
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.3, ease: "easeOut" }}
        className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/5 border border-primary/10 mb-5"
      >
        <Icon className="h-9 w-9 text-primary/60" />
      </motion.div>
      <motion.h3 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="text-lg font-semibold text-foreground"
      >
        {title}
      </motion.h3>
      <motion.p 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="mt-2 text-sm text-muted-foreground max-w-sm leading-relaxed"
      >
        {description}
      </motion.p>
      <motion.div 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
        className="flex items-center gap-3 mt-5"
      >
        {actionLabel && onAction && (
          <Button onClick={onAction} className="gap-2 gradient-whatsapp">
            {actionLabel}
          </Button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <Button variant="outline" onClick={onSecondaryAction} className="gap-2">
            {secondaryActionLabel}
          </Button>
        )}
      </motion.div>
    </motion.div>
  );
}
