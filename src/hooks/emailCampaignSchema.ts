import * as z from "zod";
import { EmailContent } from "@/components/email-marketing/editor/types";
import { AudienceType } from "@/components/email-marketing/AudienceSelector";
import { AudienceReference } from "@/hooks/useAudienceEstimate";

export const campaignSchema = z.object({
  internal_name: z.string().min(1, "Nome interno é obrigatório"),
  subject: z.string().min(1, "Assunto é obrigatório"),
  preheader: z.string().optional(),
  sender_name: z.string().min(1, "Nome do remetente é obrigatório"),
  sender_email: z.string().email("E-mail inválido"),
  reply_to: z.string().email("E-mail inválido").optional().or(z.literal("")),
  campaign_type: z.enum(["newsletter", "promotion", "relationship", "automation", "update"]),
  template_id: z.string().optional(),
  scheduled_at: z.string().optional(),
  email_integration_id: z.string().uuid("Selecione uma integração SMTP"),
});

export type CampaignFormData = z.infer<typeof campaignSchema>;

export interface UseEmailCampaignFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId?: string;
  defaultValues?: Partial<CampaignFormData>;
}

const toPlainText = (value: string) => value.replace(/\s+/g, " ").trim();

export function buildEditableContentFromHtml(html: string): EmailContent | null {
  if (!html) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const blocks: EmailContent["blocks"] = [];

    doc.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (!src) return;
      blocks.push({ type: "image", url: src, alt: img.getAttribute("alt") || "Imagem", width: img.getAttribute("width") || "100%", alignment: "center", padding: "20px" });
    });

    doc.querySelectorAll("h1, h2, h3").forEach((heading) => {
      const text = toPlainText(heading.textContent || "");
      if (!text) return;
      blocks.push({ type: "heading", text, level: heading.tagName.toLowerCase() as "h1" | "h2" | "h3", alignment: "left", padding: "20px" });
    });

    doc.querySelectorAll("p").forEach((paragraph) => {
      const text = toPlainText(paragraph.textContent || "");
      if (!text) return;
      blocks.push({ type: "text", content: text, alignment: "left", padding: "20px" });
    });

    const unsubscribeLink = doc.querySelector('a[href*="unsubscribe"], a[href*="{{unsubscribe_url}}"]');
    if (unsubscribeLink) {
      blocks.push({ type: "unsubscribe", text: "Não quer mais receber nossos e-mails?", linkText: toPlainText(unsubscribeLink.textContent || "") || "Cancelar inscrição", alignment: "center", padding: "20px" });
    }

    if (blocks.length === 0) {
      const fallbackText = toPlainText(doc.body?.textContent || "");
      if (!fallbackText) return null;
      blocks.push({ type: "text", content: fallbackText.slice(0, 1200), alignment: "left", padding: "20px" });
    }

    return { blocks, globalStyles: {} };
  } catch {
    return null;
  }
}

export type { AudienceType, AudienceReference };
