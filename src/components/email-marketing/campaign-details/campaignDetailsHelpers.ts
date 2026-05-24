export const eventTypeLabels: Record<string, { label: string; className: string }> = {
  send: { label: "Enviado", className: "bg-secondary" },
  delivered: { label: "Entregue", className: "bg-primary/10 text-primary" },
  open: { label: "Aberto", className: "bg-primary/10 text-primary" },
  click: { label: "Clicado", className: "bg-primary/10 text-primary" },
  bounce: { label: "Bounce", className: "bg-destructive/10 text-destructive" },
  complaint: { label: "Reclamação", className: "bg-destructive/10 text-destructive" },
  unsubscribe: { label: "Descadastro", className: "bg-yellow-100 text-yellow-800" },
};

export const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-secondary" },
  sent: { label: "Enviado", className: "bg-primary/10 text-primary" },
  delivered: { label: "Entregue", className: "bg-primary/10 text-primary" },
  info: { label: "Info", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  error: { label: "Erro", className: "bg-destructive/10 text-destructive" },
};
