import type { Alignment } from './types';

/** Escapa texto digitado pelo usuário antes de ir para o HTML do e-mail. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Endereço de link seguro para atributo href (só http, https, mailto, tel, âncora ou variável {{...}}). */
export function safeUrl(raw: string | undefined | null): string {
  const url = (raw ?? '').trim();
  if (!url) return '#';
  if (/^(https?:|mailto:|tel:|#|\{\{)/i.test(url)) return esc(url);
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) return esc(`https://${url}`);
  return '#';
}

/**
 * Texto do usuário -> HTML do e-mail: escapa, mantém as tags simples de versões antigas (<b>, <i>, <u>, <br>, <a href>),
 * aceita **negrito** e [texto](link) e transforma quebra de linha em <br> (o e-mail não respeita \n).
 */
export function inlineFormat(text: string | undefined | null): string {
  let out = esc(text ?? '');
  out = out
    .replace(/&lt;(\/?)(b|strong|i|em|u|br)\s*\/?&gt;/gi, (_m, slash, tag) => `<${slash}${String(tag).toLowerCase()}>`)
    .replace(/&lt;a href=&quot;(https?:\/\/(?:(?!&quot;).)*)&quot;&gt;/gi, '<a href="$1">')
    .replace(/&lt;\/a&gt;/gi, '</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<![\w/])__(?!\s)([^_\n]+?)(?<!\s)__(?![\w/])/g, '<u>$1</u>')
    .replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, '<em>$1</em>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s"]+)\)/g, '<a href="$2" style="color: inherit; text-decoration: underline;">$1</a>')
    .replace(/\r?\n/g, '<br>');
  return out;
}

export const alignOf = (a: Alignment | undefined, fallback: Alignment): Alignment => a || fallback;

/** Margem que posiciona um elemento de bloco (imagem, tabela) conforme o alinhamento. */
export function blockMargin(a: Alignment): string {
  return a === 'center' ? '0 auto' : a === 'right' ? '0 0 0 auto' : '0';
}

/** Número de pixels de um valor "300px" ou "300"; null para porcentagem/auto. */
export function pxNumber(value: string | undefined): number | null {
  const m = (value ?? '').trim().match(/^(\d+(?:\.\d+)?)(px)?$/i);
  return m ? Number(m[1]) : null;
}

export function getBaseStyles(block: { backgroundColor?: string; padding?: string; margin?: string; borderRadius?: string; fontFamily?: string }): string {
  const styles: string[] = [];
  if (block.backgroundColor) styles.push(`background-color: ${block.backgroundColor}`);
  if (block.padding) styles.push(`padding: ${block.padding}`);
  if (block.margin) styles.push(`margin: ${block.margin}`);
  if (block.borderRadius) styles.push(`border-radius: ${block.borderRadius}`);
  if (block.fontFamily) styles.push(`font-family: ${block.fontFamily}`);
  return styles.join('; ');
}

/** Botão "à prova de cliente de e-mail": tabela com fundo + link. */
export function bulletproofButton(opts: {
  text: string; url: string; align: Alignment;
  color: string; textColor: string; radius: string; fontSize: string; padding: string; fullWidth?: boolean;
}): string {
  const width = opts.fullWidth ? ' width="100%"' : '';
  const margin = opts.fullWidth ? '0' : blockMargin(opts.align);
  const anchorDisplay = opts.fullWidth ? 'display: block; text-align: center;' : 'display: inline-block;';
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="${opts.align}"${width} style="margin: ${margin};">
        <tr>
          <td style="background-color: ${opts.color}; border-radius: ${opts.radius};">
            <a href="${safeUrl(opts.url)}" style="${anchorDisplay} padding: ${opts.padding}; color: ${opts.textColor}; text-decoration: none; font-weight: bold; font-size: ${opts.fontSize};">${esc(opts.text)}</a>
          </td>
        </tr>
      </table>`;
}
