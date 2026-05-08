/**
 * Generate HTML from email content JSON (server-side version)
 * Mirrors the frontend generateEmailHtml with full block support
 */

/** Email content structure */
interface EmailContent {
  blocks?: EmailBlock[];
  globalStyles?: {
    bodyBackground?: string;
    contentWidth?: string;
    fontFamily?: string;
  };
  backgroundColor?: string;
}

/** Individual email block */
interface EmailBlock {
  type: string;
  // Layout
  padding?: string;
  margin?: string;
  backgroundColor?: string;
  borderRadius?: string;
  alignment?: string;
  color?: string;
  fontSize?: string;
  // Content
  text?: string;
  content?: string;
  // Header
  logoUrl?: string;
  logoAlt?: string;
  logoWidth?: string;
  // Heading
  level?: string;
  // Button
  buttonColor?: string;
  textColor?: string;
  buttonPadding?: string;
  url?: string;
  // Image / Banner
  imageUrl?: string;
  alt?: string;
  width?: string;
  linkUrl?: string;
  height?: string;
  // Divider
  thickness?: string;
  // Product
  name?: string;
  description?: string;
  price?: string;
  buttonText?: string;
  buttonUrl?: string;
  // Social
  iconSize?: string;
  platforms?: SocialPlatform[];
  // Columns
  columnGap?: string;
  column1?: EmailBlock[];
  column2?: EmailBlock[];
  column3?: EmailBlock[];
  // Unsubscribe
  linkText?: string;
}

interface SocialPlatform {
  name: string;
  url: string;
}

export function generateEmailHtml(content: EmailContent | null | undefined, preheader?: string): string {
  if (!content || !content.blocks) {
    return "<html><body><p>No content</p></body></html>";
  }

  const blocks = content.blocks || [];
  const globalStyles = content.globalStyles || {};
  const backgroundColor = globalStyles.bodyBackground || content.backgroundColor || "#f4f4f4";
  const contentWidth = globalStyles.contentWidth || "600px";
  const fontFamily = globalStyles.fontFamily || "Arial, sans-serif";

  const blockHtml = blocks.map((block: EmailBlock) => renderBlock(block).trim()).join("\n");

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:${backgroundColor};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
  <style type="text/css">
    body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a { color: #0066cc; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .email-container { width: 100% !important; }
      .mobile-padding { padding: 10px !important; }
      .mobile-column { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${backgroundColor}; font-family: ${fontFamily};">
  ${preheaderHtml}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="email-container" style="margin: 0 auto; width: ${contentWidth}; max-width: 600px; background-color: #ffffff;">
          ${blockHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function getBaseStyles(block: EmailBlock): string {
  const styles: string[] = [];
  if (block.backgroundColor) styles.push(`background-color: ${block.backgroundColor}`);
  if (block.padding) styles.push(`padding: ${block.padding}`);
  if (block.margin) styles.push(`margin: ${block.margin}`);
  if (block.borderRadius) styles.push(`border-radius: ${block.borderRadius}`);
  return styles.join('; ');
}

function renderBlock(block: EmailBlock): string {
  const padding = block.padding || "20px";
  const baseStyles = getBaseStyles(block);

  switch (block.type) {
    case "header": {
      const alignment = block.alignment || "center";
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; padding: ${padding};">
            ${block.logoUrl ? `<img src="${block.logoUrl}" alt="${block.logoAlt || 'Logo'}" width="${block.logoWidth || '150'}" style="display: inline-block; max-width: 100%;">` : '<div style="font-size: 24px; font-weight: bold;">Logo</div>'}
          </td>
        </tr>`;
    }

    case "heading": {
      const level = block.level || "h2";
      const fontSize = block.fontSize || (level === "h1" ? "32px" : level === "h2" ? "24px" : "20px");
      const alignment = block.alignment || "left";
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; padding: ${padding};">
            <${level} style="margin: 0; color: ${block.color || "#333333"}; font-size: ${fontSize}; font-weight: bold;">${block.text || ""}</${level}>
          </td>
        </tr>`;
    }

    case "text": {
      const alignment = block.alignment || "left";
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; color: ${block.color || "#666666"}; font-size: ${block.fontSize || "16px"}; line-height: 1.6; padding: ${padding};">
            ${(block.content || "").replace(/\n/g, "<br>")}
          </td>
        </tr>`;
    }

    case "button": {
      const alignment = block.alignment || "center";
      const buttonColor = block.buttonColor || "#0066cc";
      const textColor = block.textColor || "#ffffff";
      const buttonPadding = block.buttonPadding || "12px 30px";
      const borderRadius = block.borderRadius || "4px";
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; padding: ${padding};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
              <tr>
                <td style="background-color: ${buttonColor}; border-radius: ${borderRadius};">
                  <a href="${block.url || "#"}" style="display: inline-block; padding: ${buttonPadding}; color: ${textColor}; text-decoration: none; font-weight: bold; font-size: 16px;">${block.text || "Clique aqui"}</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case "image": {
      const alignment = block.alignment || "center";
      const width = block.width || "100%";
      const img = `<img src="${block.url || ""}" alt="${block.alt || "Imagem"}" width="${width}" style="display: block; max-width: 100%; height: auto;">`;
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; padding: ${padding};">
            ${block.linkUrl ? `<a href="${block.linkUrl}" style="display: inline-block;">${img}</a>` : img}
          </td>
        </tr>`;
    }

    case "divider": {
      const color = block.color || "#dddddd";
      const thickness = block.thickness || "1px";
      const width = block.width || "100%";
      return `
        <tr>
          <td style="${baseStyles}; padding: ${padding};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${width}" style="margin: 0 auto;">
              <tr>
                <td style="border-top: ${thickness} solid ${color};"></td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case "spacer":
      return `
        <tr>
          <td style="height: ${block.height || "20px"}; line-height: ${block.height || "20px"}; font-size: 1px;">&nbsp;</td>
        </tr>`;

    case "columns-2": {
      const gap = block.columnGap || "20px";
      return `
        <tr>
          <td style="${baseStyles}; padding: ${padding};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td class="mobile-column" width="50%" style="padding-right: ${gap}; vertical-align: top;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    ${(block.column1 || []).map((b: EmailBlock) => renderBlock(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Coluna 1</td></tr>'}
                  </table>
                </td>
                <td class="mobile-column" width="50%" style="vertical-align: top;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    ${(block.column2 || []).map((b: EmailBlock) => renderBlock(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Coluna 2</td></tr>'}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case "columns-3": {
      const gap = block.columnGap || "15px";
      return `
        <tr>
          <td style="${baseStyles}; padding: ${padding};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td class="mobile-column" width="33%" style="padding-right: ${gap}; vertical-align: top;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    ${(block.column1 || []).map((b: EmailBlock) => renderBlock(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Col 1</td></tr>'}
                  </table>
                </td>
                <td class="mobile-column" width="33%" style="padding-right: ${gap}; vertical-align: top;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    ${(block.column2 || []).map((b: EmailBlock) => renderBlock(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Col 2</td></tr>'}
                  </table>
                </td>
                <td class="mobile-column" width="33%" style="vertical-align: top;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    ${(block.column3 || []).map((b: EmailBlock) => renderBlock(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Col 3</td></tr>'}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }

    case "banner": {
      const height = block.height || "auto";
      const img = `<img src="${block.imageUrl || ""}" alt="${block.alt || "Banner"}" width="100%" height="${height}" style="display: block; max-width: 100%; height: ${height};">`;
      return `
        <tr>
          <td style="${baseStyles}; padding: 0;">
            ${block.linkUrl ? `<a href="${block.linkUrl}" style="display: block;">${img}</a>` : img}
          </td>
        </tr>`;
    }

    case "product":
      return `
        <tr>
          <td style="${baseStyles}; padding: ${padding};">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="text-align: center;">
                  <img src="${block.imageUrl || ""}" alt="${block.name || "Produto"}" width="100%" style="display: block; max-width: 300px; margin: 0 auto;">
                </td>
              </tr>
              <tr>
                <td style="padding: 15px 0; text-align: center;">
                  <h3 style="margin: 0 0 10px; font-size: 20px; color: #333;">${block.name || "Nome do Produto"}</h3>
                  ${block.description ? `<p style="margin: 0 0 10px; color: #666; font-size: 14px;">${block.description}</p>` : ""}
                  ${block.price ? `<p style="margin: 0 0 15px; font-size: 24px; font-weight: bold; color: #0066cc;">${block.price}</p>` : ""}
                  ${block.buttonText ? `
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                    <tr>
                      <td style="background-color: #0066cc; border-radius: 4px;">
                        <a href="${block.buttonUrl || "#"}" style="display: inline-block; padding: 12px 30px; color: #ffffff; text-decoration: none; font-weight: bold;">${block.buttonText}</a>
                      </td>
                    </tr>
                  </table>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`;

    case "social": {
      const alignment = block.alignment || "center";
      const iconSize = block.iconSize || "32px";
      const socialIcons: Record<string, string> = {
        facebook: "https://cdn-icons-png.flaticon.com/512/733/733547.png",
        instagram: "https://cdn-icons-png.flaticon.com/512/2111/2111463.png",
        twitter: "https://cdn-icons-png.flaticon.com/512/733/733579.png",
        linkedin: "https://cdn-icons-png.flaticon.com/512/733/733561.png",
        youtube: "https://cdn-icons-png.flaticon.com/512/733/733646.png",
      };
      const iconsHtml = (block.platforms || []).map((p: SocialPlatform) =>
        `<a href="${p.url}" style="display: inline-block; margin: 0 8px;"><img src="${socialIcons[p.name] || ""}" alt="${p.name}" width="${iconSize}" height="${iconSize}" style="display: block;"></a>`
      ).join("");
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; padding: ${padding};">
            ${iconsHtml || '<p style="color: #999;">Adicione redes sociais</p>'}
          </td>
        </tr>`;
    }

    case "footer": {
      const alignment = block.alignment || "center";
      const color = block.color || "#999999";
      const fontSize = block.fontSize || "14px";
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; color: ${color}; font-size: ${fontSize}; line-height: 1.6; padding: ${padding};">
            ${block.content || ""}
          </td>
        </tr>`;
    }

    case "legal": {
      const fontSize = block.fontSize || "11px";
      const color = block.color || "#999999";
      return `
        <tr>
          <td style="${baseStyles}; text-align: center; color: ${color}; font-size: ${fontSize}; line-height: 1.4; padding: ${padding};">
            ${block.content || ""}
          </td>
        </tr>`;
    }

    case "unsubscribe": {
      const alignment = block.alignment || "center";
      const fontSize = block.fontSize || "12px";
      const color = block.color || "#999999";
      return `
        <tr>
          <td style="${baseStyles}; text-align: ${alignment}; color: ${color}; font-size: ${fontSize}; padding: ${padding};">
            ${block.text || "Não quer mais receber nossos e-mails?"} <a href="{{unsubscribe_url}}" style="color: ${color}; text-decoration: underline;">${block.linkText || "Cancelar inscrição"}</a>
          </td>
        </tr>`;
    }

    default:
      return "";
  }
}
