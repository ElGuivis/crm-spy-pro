/**
 * Receptionist menu sending utilities.
 * Eliminates the 4x duplicated pattern of buttons/list/text-fallback menu sending.
 */
import {
  sendTextWithTokenCharge,
  sendButtonsWithTokenCharge,
  sendListWithTokenCharge,
  WhatsAppConfig,
} from "./whatsapp-sender.ts";
import { replaceMessagePlaceholders } from "./wa-webhook-message-parser.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

type ServiceClient = ReturnType<typeof createClient>;

export interface MenuOption {
  id: string;
  label: string;
  action_type: string;
  target_column_id?: string;
  response_message?: string;
}

interface ReceptionistMenuConfig {
  name?: string;
  welcome_message: string;
  menu_format?: string;
  menu_options: MenuOption[];
  list_title?: string;
  list_button_text?: string;
}

interface SendMenuParams {
  config: ReceptionistMenuConfig;
  whatsAppConfig: WhatsAppConfig;
  phone: string;
  contactName: string;
  supabase: ServiceClient;
  tenantId: string;
  conversationId: string;
  tokenDescription: string;
  /** When true, skip the welcome_message and send only the menu options */
  skipWelcome?: boolean;
}

/**
 * Send receptionist menu using the best format (buttons → list → text fallback).
 * Returns { success, menuText } where menuText is the plain-text version for DB storage.
 */
export async function sendReceptionistMenu(params: SendMenuParams): Promise<{ success: boolean; menuText: string }> {
  const { config, whatsAppConfig, phone, contactName, supabase, tenantId, conversationId, tokenDescription, skipWelcome } = params;

  const welcomeMsg = replaceMessagePlaceholders(config.welcome_message, contactName);
  const menuOptionsText = config.menu_options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  const headerText = skipWelcome ? "Escolha uma opção:" : welcomeMsg;
  const menuText = skipWelcome ? `Escolha uma opção:\n\n${menuOptionsText}` : `${welcomeMsg}\n\n${menuOptionsText}`;
  let success = false;

  if (config.menu_format === "buttons" && config.menu_options.length <= 3) {
    const buttons = config.menu_options.slice(0, 3).map((opt) => ({
      id: `receptionist_${opt.id}`,
      displayText: opt.label.substring(0, 20),
    }));

    const btnResult = await sendButtonsWithTokenCharge(
      whatsAppConfig, phone, config.name || "Menu", headerText, buttons,
      supabase, tenantId, "receptionist", tokenDescription, conversationId,
      config.list_button_text || "Escolha uma opção"
    );

    if (btnResult.success) {
      success = true;
    } else if (btnResult.error !== "INSUFFICIENT_TOKENS") {
      const textResult = await sendTextWithTokenCharge(
        whatsAppConfig, phone, menuText,
        supabase, tenantId, "receptionist", `${tokenDescription} (fallback texto)`, conversationId
      );
      success = textResult.success;
    }
  } else {
    const sections = [{
      title: config.list_title || "Opções",
      rows: config.menu_options.map((opt) => ({
        rowId: `receptionist_${opt.id}`,
        title: opt.label.substring(0, 24),
        description: "",
      })),
    }];

    const listResult = await sendListWithTokenCharge(
      whatsAppConfig, phone, config.name || "Menu", headerText,
      config.list_button_text || "Ver opções", sections,
      supabase, tenantId, "receptionist", tokenDescription, conversationId
    );

    if (listResult.success) {
      success = true;
    } else if (listResult.error !== "INSUFFICIENT_TOKENS") {
      const textResult = await sendTextWithTokenCharge(
        whatsAppConfig, phone, menuText,
        supabase, tenantId, "receptionist", `${tokenDescription} (fallback texto)`, conversationId
      );
      success = textResult.success;
    }
  }

  return { success, menuText };
}
