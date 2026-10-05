import type {
  Alignment, BannerBlock, ButtonBlock, CartItemsBlock, Columns2Block, Columns3Block, DividerBlock, EmailBlock, FooterBlock,
  HeaderBlock, HeadingBlock, ImageBlock, LegalBlock, SocialBlock, SpacerBlock, TextBlock, UnsubscribeBlock,
} from './types';
import { alignOf, blockMargin, bulletproofButton, esc, getBaseStyles, inlineFormat, pxNumber, safeUrl } from './htmlHelpers';
import { generateCouponHTML, generateImageTextHTML, generateProductHTML } from './htmlProductBlocks';

export { getBaseStyles } from './htmlHelpers';

export function generateBlockHTML(block: EmailBlock): string {
  switch (block.type) {
    case 'header': return generateHeaderHTML(block);
    case 'heading': return generateHeadingHTML(block);
    case 'text': return generateTextHTML(block);
    case 'image': return generateImageHTML(block);
    case 'button': return generateButtonHTML(block);
    case 'divider': return generateDividerHTML(block);
    case 'spacer': return generateSpacerHTML(block);
    case 'columns-2': return generateColumns2HTML(block);
    case 'columns-3': return generateColumns3HTML(block);
    case 'banner': return generateBannerHTML(block);
    case 'product': return generateProductHTML(block);
    case 'coupon': return generateCouponHTML(block);
    case 'cart-items': return generateCartItemsHTML(block);
    case 'imagetext': return generateImageTextHTML(block);
    case 'social': return generateSocialHTML(block);
    case 'footer': return generateFooterHTML(block);
    case 'legal': return generateLegalHTML(block);
    case 'unsubscribe': return generateUnsubscribeHTML(block);
    default: return '';
  }
}

/** Itens do carrinho: o e-mail de recuperação troca {{cart_items}} pela lista da pessoa (foto, nome, quantidade, preço, total). */
function generateCartItemsHTML(block: CartItemsBlock): string {
  return `
  <tr>
    <td style="${getBaseStyles(block)}; padding: ${block.padding || '20px 36px'}; color: ${block.textColor || '#111827'};">
      ${block.title ? `<div style="font-size: 18px; font-weight: bold; color: ${block.titleColor || block.textColor || '#111827'}; margin-bottom: 8px;">${inlineFormat(block.title)}</div>` : ''}
      {{cart_items}}
    </td>
  </tr>`;
}

function generateHeaderHTML(block: HeaderBlock): string {
  const align = alignOf(block.alignment, 'center');
  const width = pxNumber(block.logoWidth) ?? 150;
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: ${align}; padding: ${block.padding || '20px'};">
      ${block.logoUrl ? `<img src="${esc(block.logoUrl)}" alt="${esc(block.logoAlt || 'Logo')}" width="${width}" style="display: inline-block; max-width: 100%; height: auto;">` : '<div style="font-size: 24px; font-weight: bold;">Logo</div>'}
    </td>
  </tr>`;
}

/** Maiúsculas e espaçamento entre letras (opcionais) de títulos e textos. */
function textStyle(b: { uppercase?: boolean; letterSpacing?: string }): string {
  return `${b.uppercase ? ' text-transform: uppercase;' : ''}${b.letterSpacing ? ` letter-spacing: ${esc(b.letterSpacing)};` : ''}`;
}

function generateHeadingHTML(block: HeadingBlock): string {
  const align = alignOf(block.alignment, 'left');
  const color = block.color || '#333333';
  const fontSize = block.fontSize || (block.level === 'h1' ? '32px' : block.level === 'h2' ? '24px' : '20px');
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: ${align}; padding: ${block.padding || '20px'};">
      <${block.level} style="margin: 0; color: ${color}; font-size: ${fontSize}; font-weight: ${block.fontWeight || 'bold'}; line-height: ${block.lineHeight || '1.25'};${textStyle(block)}">${inlineFormat(block.text || 'Título')}</${block.level}>
    </td>
  </tr>`;
}

function generateTextHTML(block: TextBlock): string {
  const align = alignOf(block.alignment, 'left');
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: ${align}; color: ${block.color || '#666666'}; font-size: ${block.fontSize || '16px'}; font-weight: ${block.fontWeight || 'normal'}; line-height: ${block.lineHeight || '1.6'};${textStyle(block)} padding: ${block.padding || '20px'};">
      ${inlineFormat(block.content || 'Texto do parágrafo')}
    </td>
  </tr>`;
}

function generateImageHTML(block: ImageBlock): string {
  const align = alignOf(block.alignment, 'center');
  const width = block.width || '100%';
  const px = pxNumber(width);
  const img = `<img src="${esc(block.url || 'https://via.placeholder.com/600x300')}" alt="${esc(block.alt || 'Imagem')}" width="${px ?? '100%'}" style="display: block; width: ${px ? `${px}px` : width}; max-width: 100%; height: auto; margin: ${blockMargin(align)};${block.borderRadius ? ` border-radius: ${block.borderRadius};` : ''}">`;
  return `
  <tr>
    <td style="${getBaseStyles({ ...block, borderRadius: undefined })}; text-align: ${align}; padding: ${block.padding || '20px'};">
      ${block.linkUrl ? `<a href="${safeUrl(block.linkUrl)}" style="display: block;">${img}</a>` : img}
    </td>
  </tr>`;
}

function generateButtonHTML(block: ButtonBlock): string {
  const align = alignOf(block.alignment, 'center');
  const button = bulletproofButton({
    text: block.text || 'Clique aqui', url: block.url, align,
    color: block.buttonColor || '#0066cc', textColor: block.textColor || '#ffffff',
    radius: block.borderRadius || '4px', fontSize: block.fontSize || '16px',
    padding: block.buttonPadding || '12px 30px', fullWidth: block.fullWidth,
  });
  return `
  <tr>
    <td style="${getBaseStyles({ ...block, borderRadius: undefined })}; text-align: ${align}; padding: ${block.padding || '20px'};">
      ${button}
    </td>
  </tr>`;
}

function generateDividerHTML(block: DividerBlock): string {
  const color = block.color || '#dddddd';
  const thickness = block.thickness || '1px';
  const width = block.width || '100%';
  return `
  <tr>
    <td style="${getBaseStyles(block)}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="${width}" style="margin: 0 auto;">
        <tr>
          <td style="border-top: ${thickness} solid ${color}; font-size: 1px; line-height: 1px;">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateSpacerHTML(block: SpacerBlock): string {
  const height = block.height || '20px';
  return `
  <tr>
    <td style="${block.backgroundColor ? `background-color: ${block.backgroundColor}; ` : ''}height: ${height}; line-height: ${height}; font-size: 1px;">&nbsp;</td>
  </tr>`;
}

const RATIOS: Record<NonNullable<Columns2Block['ratio']>, [number, number]> = {
  '50-50': [50, 50], '33-67': [33, 67], '67-33': [67, 33], '25-75': [25, 75], '75-25': [75, 25],
};
export const columnWidths = (ratio: Columns2Block['ratio']): [number, number] => RATIOS[ratio ?? '50-50'] ?? [50, 50];

function column(blocks: EmailBlock[] | undefined, placeholder: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              ${blocks?.length ? blocks.map((b) => generateBlockHTML(b).trim()).join('\n') : `<tr><td style="padding: 10px; text-align: center; color: #999;">${placeholder}</td></tr>`}
            </table>`;
}

function generateColumns2HTML(block: Columns2Block): string {
  const gap = block.columnGap || '20px';
  const [w1, w2] = columnWidths(block.ratio);
  const valign = block.verticalAlign === 'middle' ? 'middle' : 'top';
  const cls = block.mobileCols === 2 ? 'mobile-half' : 'mobile-column';
  return `
  <tr>
    <td style="${getBaseStyles(block)}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td class="${cls}" width="${w1}%" style="padding-right: ${gap}; vertical-align: ${valign};">
            ${column(block.column1, 'Coluna 1')}
          </td>
          <td class="${cls}" width="${w2}%" style="vertical-align: ${valign};">
            ${column(block.column2, 'Coluna 2')}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateColumns3HTML(block: Columns3Block): string {
  const gap = block.columnGap || '15px';
  const valign = block.verticalAlign === 'middle' ? 'middle' : 'top';
  const cls = block.mobileCols === 2 ? 'mobile-half' : 'mobile-column';
  return `
  <tr>
    <td style="${getBaseStyles(block)}; padding: ${block.padding || '20px'};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td class="${cls}" width="33%" style="padding-right: ${gap}; vertical-align: ${valign};">
            ${column(block.column1, 'Col 1')}
          </td>
          <td class="${cls}" width="33%" style="padding-right: ${gap}; vertical-align: ${valign};">
            ${column(block.column2, 'Col 2')}
          </td>
          <td class="${cls}" width="33%" style="vertical-align: ${valign};">
            ${column(block.column3, 'Col 3')}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function generateBannerHTML(block: BannerBlock): string {
  const height = block.height || 'auto';
  const img = `<img src="${esc(block.imageUrl || 'https://via.placeholder.com/600x200')}" alt="${esc(block.alt || 'Banner')}" width="100%" style="display: block; width: 100%; max-width: 100%; height: ${height};">`;
  return `
  <tr>
    <td style="${getBaseStyles({ ...block, padding: undefined })}; padding: 0;">
      ${block.linkUrl ? `<a href="${safeUrl(block.linkUrl)}" style="display: block;">${img}</a>` : img}
    </td>
  </tr>`;
}

const SOCIAL_ICONS: Record<string, string> = {
  facebook: 'https://cdn-icons-png.flaticon.com/512/733/733547.png',
  instagram: 'https://cdn-icons-png.flaticon.com/512/2111/2111463.png',
  twitter: 'https://cdn-icons-png.flaticon.com/512/733/733579.png',
  linkedin: 'https://cdn-icons-png.flaticon.com/512/733/733561.png',
  youtube: 'https://cdn-icons-png.flaticon.com/512/733/733646.png',
};

function generateSocialHTML(block: SocialBlock): string {
  const align: Alignment = alignOf(block.alignment, 'center');
  const iconSize = pxNumber(block.iconSize) ?? 32;
  const iconsHTML = (block.platforms || []).map((platform) =>
    `<a href="${safeUrl(platform.url)}" style="display: inline-block; margin: 0 8px;"><img src="${SOCIAL_ICONS[platform.name] || ''}" alt="${esc(platform.name)}" width="${iconSize}" height="${iconSize}" style="display: block;"></a>`,
  ).join('');
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: ${align}; padding: ${block.padding || '20px'};">
      ${iconsHTML || '<p style="color: #999;">Adicione redes sociais</p>'}
    </td>
  </tr>`;
}

function generateFooterHTML(block: FooterBlock): string {
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: ${alignOf(block.alignment, 'center')}; color: ${block.color || '#999999'}; font-size: ${block.fontSize || '14px'}; line-height: 1.6; padding: ${block.padding || '20px'};">
      ${block.content || 'Rodapé do e-mail'}
    </td>
  </tr>`;
}

function generateLegalHTML(block: LegalBlock): string {
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: center; color: ${block.color || '#999999'}; font-size: ${block.fontSize || '11px'}; line-height: 1.4; padding: ${block.padding || '20px'};">
      ${inlineFormat(block.content || 'Texto legal e informações obrigatórias')}
    </td>
  </tr>`;
}

function generateUnsubscribeHTML(block: UnsubscribeBlock): string {
  const color = block.color || '#999999';
  return `
  <tr>
    <td style="${getBaseStyles(block)}; text-align: ${alignOf(block.alignment, 'center')}; color: ${color}; font-size: ${block.fontSize || '12px'}; padding: ${block.padding || '20px'};">
      ${esc(block.text || 'Não quer mais receber nossos e-mails?')} <a href="{{unsubscribe_url}}" style="color: ${color}; text-decoration: underline;">${esc(block.linkText || 'Cancelar inscrição')}</a>
    </td>
  </tr>`;
}
