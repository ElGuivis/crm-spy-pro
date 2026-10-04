import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlignLeft, AlignCenter, AlignRight, X } from "lucide-react";
import type { Alignment } from "../types";

/** Cor com seletor, código hexadecimal e botão para voltar ao padrão. */
export function ColorField({ label, value, fallback, onChange }: {
  label: string; value?: string; fallback: string; onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input type="color" className="h-9 w-12 shrink-0 cursor-pointer p-1" value={value || fallback} onChange={(e) => onChange(e.target.value)} />
        <Input className="h-9 font-mono text-xs" value={value ?? ""} placeholder={fallback} onChange={(e) => onChange(e.target.value.trim() || undefined)} />
        {value && (
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Voltar ao padrão" onClick={() => onChange(undefined)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Esquerda / centro / direita. */
export function AlignField({ label = "Alinhamento", value, fallback, onChange }: {
  label?: string; value?: Alignment; fallback: Alignment; onChange: (v: Alignment) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <ToggleGroup type="single" variant="outline" className="justify-start" value={value || fallback}
        onValueChange={(v) => v && onChange(v as Alignment)}>
        <ToggleGroupItem value="left" aria-label="Esquerda"><AlignLeft className="h-4 w-4" /></ToggleGroupItem>
        <ToggleGroupItem value="center" aria-label="Centro"><AlignCenter className="h-4 w-4" /></ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Direita"><AlignRight className="h-4 w-4" /></ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

const numberOf = (v: string | undefined): number | "" => {
  const m = (v ?? "").match(/^(\d+(?:\.\d+)?)px$/);
  return m ? Number(m[1]) : "";
};

/** Número em pixels (tamanho de fonte, arredondamento, largura...). Vazio = padrão. */
export function PxField({ label, value, placeholder, onChange, max = 999 }: {
  label: string; value?: string; placeholder?: string; onChange: (v: string | undefined) => void; max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Input type="number" min={0} max={max} className="h-9 pr-8" value={numberOf(value)} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? undefined : `${Math.min(max, Math.max(0, Number(e.target.value)))}px`)} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">px</span>
      </div>
    </div>
  );
}

/** Espaçamento interno: topo, direita, base, esquerda. */
export function SpacingField({ label = "Espaçamento interno", value, fallback = "20px", onChange }: {
  label?: string; value?: string; fallback?: string; onChange: (v: string) => void;
}) {
  const parts = (value || fallback).split(/\s+/).map((p) => parseFloat(p) || 0);
  const [t, r, b, l] = parts.length === 1 ? [parts[0], parts[0], parts[0], parts[0]]
    : parts.length === 2 ? [parts[0], parts[1], parts[0], parts[1]]
    : parts.length === 3 ? [parts[0], parts[1], parts[2], parts[1]]
    : [parts[0], parts[1], parts[2], parts[3]];
  const set = (idx: number, n: string) => {
    const next = [t, r, b, l];
    next[idx] = Math.max(0, Number(n) || 0);
    onChange(`${next[0]}px ${next[1]}px ${next[2]}px ${next[3]}px`);
  };
  const cell = (idx: number, title: string, v: number) => (
    <div key={idx} className="space-y-1">
      <Input type="number" min={0} className="h-8 px-2 text-center text-xs" value={v} onChange={(e) => set(idx, e.target.value)} />
      <p className="text-center text-[10px] text-muted-foreground">{title}</p>
    </div>
  );
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label} (px)</Label>
      <div className="grid grid-cols-4 gap-2">{cell(0, "Cima", t)}{cell(1, "Direita", r)}{cell(2, "Baixo", b)}{cell(3, "Esquerda", l)}</div>
    </div>
  );
}

export function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Largura: atalhos de porcentagem ou valor livre ("320px", "60%"). */
export function WidthField({ label = "Largura", value, fallback = "100%", onChange }: {
  label?: string; value?: string; fallback?: string; onChange: (v: string) => void;
}) {
  const current = value || fallback;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {["100%", "75%", "50%", "25%"].map((p) => (
          <Button key={p} type="button" size="sm" variant={current === p ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => onChange(p)}>{p}</Button>
        ))}
      </div>
      <Input className="h-9" value={value ?? ""} placeholder={fallback} onChange={(e) => onChange(e.target.value.trim())} />
    </div>
  );
}
