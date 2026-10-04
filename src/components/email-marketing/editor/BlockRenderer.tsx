import { useMemo } from 'react';
import type { EmailBlock } from './types';
import { generateBlockHTML } from './htmlBlockGenerators';
import { sanitizeHtml } from '@/lib/sanitize-html';

interface BlockRendererProps {
  block: EmailBlock;
  isPreview?: boolean;
}

/**
 * Mostra o bloco no editor com o MESMO HTML que vai no e-mail (htmlBlockGenerators): o que se vê aqui é o que chega.
 * Antes havia um renderizador separado do gerador de HTML e os dois divergiam (cores, alinhamento, botão).
 */
export function BlockRenderer({ block, isPreview = false }: BlockRendererProps) {
  const html = useMemo(
    () => sanitizeHtml(
      `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;"><tbody>${generateBlockHTML(block)}</tbody></table>`,
      'emailPreview',
    ),
    [block],
  );

  const wrapperClass = isPreview
    ? 'pointer-events-none'
    : 'border-2 border-dashed border-transparent hover:border-primary/50 transition-colors [&_a]:pointer-events-none';

  return <div className={wrapperClass} dangerouslySetInnerHTML={{ __html: html }} />;
}
