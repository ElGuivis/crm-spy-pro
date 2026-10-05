import type { UseFormReturn } from "react-hook-form";
import type { CampaignFormData } from "@/hooks/useEmailCampaignForm";
import { CouponConfigFields, DEFAULT_COUPON, type CouponConfig } from "./CouponConfigFields";

/** Cupom único por pessoa da campanha (formulário): liga/desliga mantendo os valores digitados. */
export function UniqueCouponFields({ form }: { form: UseFormReturn<CampaignFormData> }) {
  const value = form.watch("unique_coupon");
  const on = !!value?.enabled;
  return (
    <CouponConfigFields
      value={on ? ({ ...DEFAULT_COUPON, ...value } as CouponConfig) : null}
      onChange={(next) => form.setValue("unique_coupon", next ? ({ ...DEFAULT_COUPON, ...(value ?? {}), ...next, enabled: true } as CampaignFormData["unique_coupon"]) : (value ? { ...value, enabled: false } : null), { shouldDirty: true })}
    />
  );
}
