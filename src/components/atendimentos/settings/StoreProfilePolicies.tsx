import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { POLICY_FIELDS } from "@/hooks/useStoreProfile";

interface Props {
  policies: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}

/** Políticas da loja: o que a IA pode afirmar sobre frete, trocas, pagamento etc. */
export function StoreProfilePolicies({ policies, onChange, disabled }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {POLICY_FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`policy-${f.key}`}>{f.label}</Label>
          <Textarea
            id={`policy-${f.key}`}
            rows={3}
            maxLength={1500}
            disabled={disabled}
            placeholder={f.hint}
            value={policies[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
