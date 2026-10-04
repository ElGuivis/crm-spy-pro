import type { Alignment, CouponBlock, ProductBlock } from './types';
import { alignOf, blockMargin, bulletproofButton, esc, getBaseStyles, inlineFormat, pxNumber, safeUrl } from './htmlHelpers';

/** Bloco de produto: tudo configurável (alinhamento, cores, tamanhos, botão) e com título/imagem levando ao link. */
export function generateProductHTML(block: ProductBlock): string {
  const align: Alignment = alignOf(block.alignment, 'center');
  const url = (block.buttonUrl ?? '').trim();
  const linked = block.linkImage !== false && !!url;
  const wrapLink = (inner: string) => (linked ? `<a href="${safeUrl(url)}" style="color: inherit; text-decoration: none;">${inner}</a>` : inner);

  const imgWidth = block.imageWidth || '300px';
  const imgPx = pxNumber(imgWidth);
  const img = `<img src="${esc(block.imageUrl || 'https://via.placeholder.com/300x300')}" alt="${esc(block.name || 'Produto')}"${imgPx ? ` width="${imgPx}"` : ''} style="display: block; width: ${imgPx ? `${imgPx}px` : imgWidth}; max-width: 100%; height: auto; margin: ${blockMargin(align)};${block.imageRadius ? ` border-radius: ${block.imageRadius};` : ''}">`;

  const nameStyle = `margin: 0 0 8px; font-size: ${block.nameSize || '20px'}; font-weight: ${block.nameWeight || 'bold'}; color: ${block.nameColor || '#333333'}; line-height: 1.3;`;
  const priceSize = block.priceSize || '24px';
  const oldPrice = block.oldPrice
    ? `<span style="font-size: 0.65em; font-weight: normal; color: ${block.oldPriceColor || '#999999'}; text-decoration: line-through; margin-right: 8px;">${esc(block.oldPrice)}</span>`
    : '';
  const button = block.buttonText
    ? bulletproofButton({
        text: block.buttonText, url, align,
        color: block.buttonColor || '#0066cc', textColor: block.buttonTextColor || '#ffffff',
        radius: block.buttonRadius || '4px', fontSize: block.buttonSize || '16px', padding: '12px 30px',
        fullWidth: block.buttonFullWidth,
      })
    : '';

  return `
  <tr>
    <td style="${getBaseStyles(block)}; padding: ${block.padding || '20px'}; text-align: ${align};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td align="${align}" style="text-align: ${align};">${wrapLink(img)}</td>
        </tr>
        <tr>
          <td style="padding: 15px 0 0; text-align: ${align};">
            <h3 style="${nameStyle}">${wrapLink(inlineFormat(block.name || 'Nome do Produto'))}</h3>
            ${block.description ? `<p style="margin: 0 0 10px; color: ${block.descriptionColor || '#666666'}; font-size: ${block.descriptionSize || '14px'}; line-height: 1.5;">${inlineFormat(block.description)}</p>` : ''}
            ${block.price || block.oldPrice ? `<p style="margin: 0 0 15px; font-size: ${priceSize}; font-weight: bold; color: ${block.priceColor || '#0066cc'};">${oldPrice}${esc(block.price || '')}</p>` : ''}
            ${button}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/** Cupom em destaque: caixa tracejada com o código. */
export function generateCouponHTML(block: CouponBlock): string {
  const align: Alignment = alignOf(block.alignment, 'center');
  const border = block.borderColor || '#0066cc';
  return `
  <tr>
    <td style="${getBaseStyles(block)}; padding: ${block.padding || '20px'}; text-align: ${align};">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${align}" style="margin: ${blockMargin(align)}; border: 2px dashed ${border}; border-radius: 8px; background-color: ${block.codeBackground || '#f5f9ff'};">
        <tr>
          <td style="padding: 16px 32px; text-align: center;">
            ${block.title ? `<div style="font-size: 14px; color: ${block.titleColor || '#555555'}; margin-bottom: 6px;">${inlineFormat(block.title)}</div>` : ''}
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 3px; font-family: 'Courier New', monospace; color: ${block.codeColor || border};">${esc(block.code || 'CUPOM10')}</div>
            ${block.description ? `<div style="font-size: 13px; color: ${block.descriptionColor || '#777777'}; margin-top: 6px;">${inlineFormat(block.description)}</div>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}
