import { EmailBlock, EmailContent } from './types';

/**
 * Gera HTML responsivo e compatível com clientes de email
 * Usa tables para compatibilidade máxima
 */
export function generateEmailHTML(content: EmailContent, preheader?: string): string {
  const { blocks, globalStyles = {} } = content;
  
  const {
    bodyBackground = '#f4f4f4',
    contentWidth = '600px',
    fontFamily = 'Arial, sans-serif',
  } = globalStyles;

  const blocksHTML = blocks.map(block => generateBlockHTML(block).trim()).join('\n');

  const preheaderHTML = preheader
    ? `<div style="display:none;font-size:1px;color:${bodyBackground};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Email</title>
  <style type="text/css">
    body {
      margin: 0;
      padding: 0;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
      -ms-interpolation-mode: bicubic;
    }
    a {
      color: #0066cc;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
      }
      .mobile-padding {
        padding: 10px !important;
      }
      .mobile-hide {
        display: none !important;
      }
      .mobile-column {
        display: block !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${bodyBackground}; font-family: ${fontFamily};">
  ${preheaderHTML}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0; padding: 0;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" class="email-container" style="margin: 0 auto; width: ${contentWidth}; max-width: 600px; background-color: #ffffff;">
          ${blocksHTML}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function generateBlockHTML(block: EmailBlock): string {
  switch (block.type) {
    case 'header':
      return generateHeaderHTML(block);
    case 'heading':
      return generateHeadingHTML(block);
    case 'text':
      return generateTextHTML(block);
    case 'image':
      return generateImageHTML(block);
    case 'button':
      return generateButtonHTML(block);
    case 'divider':
      return generateDividerHTML(block);
    case 'spacer':
      return generateSpacerHTML(block);
    case 'columns-2':
      return generateColumns2HTML(block);
    case 'columns-3':
      return generateColumns3HTML(block);
    case 'banner':
      return generateBannerHTML(block);
    case 'product':
      return generateProductHTML(block);
    case 'social':
      return generateSocialHTML(block);
    case 'footer':
      return generateFooterHTML(block);
    case 'legal':
      return generateLegalHTML(block);
    case 'unsubscribe':
      return generateUnsubscribeHTML(block);
    default:
      return '';
  }
}

function getBaseStyles(block: any): string {
  const styles: string[] = [];
  if (block.backgroundColor) styles.push(`background-color: ${block.backgroundColor}`);
  if (block.padding) styles.push(`padding: ${block.padding}`);
  if (block.margin) styles.push(`margin: ${block.margin}`);
  if (block.borderRadius) styles.push(`border-radius: ${block.borderRadius}`);
  return styles.join('; ');
}

function generateHeaderHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'center';
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; padding: ${block.padding || '20px'};">
      ${block.logoUrl ? `<img src="${block.logoUrl}" alt="${block.logoAlt || 'Logo'}" width="${block.logoWidth || '150'}" style="display: inline-block; max-width: 100%;">` : '<div style="font-size: 24px; font-weight: bold;">Logo</div>'}
    </td>
  </tr>`;
}

function generateHeadingHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'left';
  const color = block.color || '#333333';
  const fontSize = block.fontSize || (block.level === 'h1' ? '32px' : block.level === 'h2' ? '24px' : '20px');
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; padding: ${block.padding || '20px'};">
      <${block.level} style="margin: 0; color: ${color}; font-size: ${fontSize}; font-weight: bold;">${block.text || 'Título'}</${block.level}>
    </td>
  </tr>`;
}

function generateTextHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'left';
  const color = block.color || '#666666';
  const fontSize = block.fontSize || '16px';
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; color: ${color}; font-size: ${fontSize}; line-height: 1.6; padding: ${block.padding || '20px'};">
      ${block.content || 'Texto do parágrafo'}
    </td>
  </tr>`;
}

function generateImageHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'center';
  const width = block.width || '100%';
  
  const img = `<img src="${block.url || 'https://via.placeholder.com/600x300'}" alt="${block.alt || 'Imagem'}" width="${width}" style="display: block; max-width: 100%; height: auto;">`;
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; padding: ${block.padding || '20px'};">
      ${block.linkUrl ? `<a href="${block.linkUrl}" style="display: inline-block;">${img}</a>` : img}
    </td>
  </tr>`;
}

function generateButtonHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'center';
  const buttonColor = block.buttonColor || '#0066cc';
  const textColor = block.textColor || '#ffffff';
  const buttonPadding = block.buttonPadding || '12px 30px';
  const borderRadius = block.borderRadius || '4px';
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
        <tr>
          <td style="background-color: ${buttonColor}; border-radius: ${borderRadius};">
            <a href="${block.url || '#'}" style="display: inline-block; padding: ${buttonPadding}; color: ${textColor}; text-decoration: none; font-weight: bold; font-size: 16px;">${block.text || 'Clique aqui'}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateDividerHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const color = block.color || '#dddddd';
  const thickness = block.thickness || '1px';
  const width = block.width || '100%';
  
  return `
  <tr>
    <td style="${baseStyles}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${width}" style="margin: 0 auto;">
        <tr>
          <td style="border-top: ${thickness} solid ${color};"></td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateSpacerHTML(block: any): string {
  const height = block.height || '20px';
  
  return `
  <tr>
    <td style="height: ${height}; line-height: ${height}; font-size: 1px;">&nbsp;</td>
  </tr>`;
}

function generateColumns2HTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const gap = block.columnGap || '20px';
  
  return `
  <tr>
    <td style="${baseStyles}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td class="mobile-column" width="50%" style="padding-right: ${gap}; vertical-align: top;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              ${block.column1?.map((b: EmailBlock) => generateBlockHTML(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Coluna 1</td></tr>'}
            </table>
          </td>
          <td class="mobile-column" width="50%" style="vertical-align: top;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              ${block.column2?.map((b: EmailBlock) => generateBlockHTML(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Coluna 2</td></tr>'}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateColumns3HTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const gap = block.columnGap || '15px';
  
  return `
  <tr>
    <td style="${baseStyles}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td class="mobile-column" width="33%" style="padding-right: ${gap}; vertical-align: top;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              ${block.column1?.map((b: EmailBlock) => generateBlockHTML(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Col 1</td></tr>'}
            </table>
          </td>
          <td class="mobile-column" width="33%" style="padding-right: ${gap}; vertical-align: top;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              ${block.column2?.map((b: EmailBlock) => generateBlockHTML(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Col 2</td></tr>'}
            </table>
          </td>
          <td class="mobile-column" width="33%" style="vertical-align: top;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              ${block.column3?.map((b: EmailBlock) => generateBlockHTML(b).trim()).join('\n') || '<tr><td style="padding: 10px; text-align: center; color: #999;">Col 3</td></tr>'}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateBannerHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const height = block.height || 'auto';
  
  const img = `<img src="${block.imageUrl || 'https://via.placeholder.com/600x200'}" alt="${block.alt || 'Banner'}" width="100%" height="${height}" style="display: block; max-width: 100%; height: ${height};">`;
  
  return `
  <tr>
    <td style="${baseStyles}; padding: 0;">
      ${block.linkUrl ? `<a href="${block.linkUrl}" style="display: block;">${img}</a>` : img}
    </td>
  </tr>`;
}

function generateProductHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  
  return `
  <tr>
    <td style="${baseStyles}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="text-align: center;">
            <img src="${block.imageUrl || 'https://via.placeholder.com/300x300'}" alt="${block.name || 'Produto'}" width="100%" style="display: block; max-width: 300px; margin: 0 auto;">
          </td>
        </tr>
        <tr>
          <td style="padding: 15px 0; text-align: center;">
            <h3 style="margin: 0 0 10px; font-size: 20px; color: #333;">${block.name || 'Nome do Produto'}</h3>
            ${block.description ? `<p style="margin: 0 0 10px; color: #666; font-size: 14px;">${block.description}</p>` : ''}
            ${block.price ? `<p style="margin: 0 0 15px; font-size: 24px; font-weight: bold; color: #0066cc;">${block.price}</p>` : ''}
            ${block.buttonText ? `
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
              <tr>
                <td style="background-color: #0066cc; border-radius: 4px;">
                  <a href="${block.buttonUrl || '#'}" style="display: inline-block; padding: 12px 30px; color: #ffffff; text-decoration: none; font-weight: bold;">${block.buttonText}</a>
                </td>
              </tr>
            </table>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateSocialHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'center';
  const iconSize = block.iconSize || '32px';
  
  const socialIcons: Record<string, string> = {
    facebook: 'https://cdn-icons-png.flaticon.com/512/733/733547.png',
    instagram: 'https://cdn-icons-png.flaticon.com/512/2111/2111463.png',
    twitter: 'https://cdn-icons-png.flaticon.com/512/733/733579.png',
    linkedin: 'https://cdn-icons-png.flaticon.com/512/733/733561.png',
    youtube: 'https://cdn-icons-png.flaticon.com/512/733/733646.png',
  };
  
  const iconsHTML = (block.platforms || []).map((platform: any) => {
    return `<a href="${platform.url}" style="display: inline-block; margin: 0 8px;"><img src="${socialIcons[platform.name] || ''}" alt="${platform.name}" width="${iconSize}" height="${iconSize}" style="display: block;"></a>`;
  }).join('');
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; padding: ${block.padding || '20px'};">
      ${iconsHTML || '<p style="color: #999;">Adicione redes sociais</p>'}
    </td>
  </tr>`;
}

function generateFooterHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'center';
  const color = block.color || '#999999';
  const fontSize = block.fontSize || '14px';
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; color: ${color}; font-size: ${fontSize}; line-height: 1.6; padding: ${block.padding || '20px'};">
      ${block.content || 'Rodapé do e-mail'}
    </td>
  </tr>`;
}

function generateLegalHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const fontSize = block.fontSize || '11px';
  const color = block.color || '#999999';
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: center; color: ${color}; font-size: ${fontSize}; line-height: 1.4; padding: ${block.padding || '20px'};">
      ${block.content || 'Texto legal e informações obrigatórias'}
    </td>
  </tr>`;
}

function generateUnsubscribeHTML(block: any): string {
  const baseStyles = getBaseStyles(block);
  const alignment = block.alignment || 'center';
  const fontSize = block.fontSize || '12px';
  const color = block.color || '#999999';
  
  return `
  <tr>
    <td style="${baseStyles}; text-align: ${alignment}; color: ${color}; font-size: ${fontSize}; padding: ${block.padding || '20px'};">
      ${block.text || 'Não quer mais receber nossos e-mails?'} <a href="{{unsubscribe_url}}" style="color: ${color}; text-decoration: underline;">${block.linkText || 'Cancelar inscrição'}</a>
    </td>
  </tr>`;
}
