import { Plug, Bot, Grid3X3, FileSpreadsheet, UserCheck } from "lucide-react";

export function CredibilityBar() {
  const items = [
    { icon: Plug, text: "8+ integrações nativas" },
    { icon: Bot, text: "IA embutida" },
    { icon: Grid3X3, text: "Matriz RFM" },
    { icon: FileSpreadsheet, text: "Disparos em massa" },
    { icon: UserCheck, text: "Multi-equipe" },
  ];

  return (
    <section className="border-y border-border/30 bg-muted/30">
      <div className="container mx-auto px-4 py-5">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {items.map((item) => (
            <div key={item.text} className="flex items-center gap-2 text-muted-foreground">
              <item.icon className="h-4 w-4 text-primary/70" />
              <span className="text-sm font-medium">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
