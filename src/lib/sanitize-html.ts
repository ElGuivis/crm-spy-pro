import DOMPurify from 'dompurify';

/**
 * Centralized HTML sanitization helper.
 * All dangerouslySetInnerHTML usages MUST go through this module.
 *
 * Presets define tag/attribute whitelists per context so we apply
 * the principle of least privilege for each rendering scenario.
 */

const PRESET_CONFIGS = {
  /** Rich text from product descriptions, footers, legal blocks */
  richText: {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i', 's',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'span', 'div',
      'table', 'tr', 'td', 'th', 'thead', 'tbody',
      'blockquote', 'pre', 'code', 'hr', 'sub', 'sup',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i,
  },

  /** Email HTML preview — allows images and layout tables */
  emailPreview: {
    ALLOWED_TAGS: [
      'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
      'div', 'span', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'a', 'img',
      'strong', 'em', 'b', 'i', 'u', 's',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'sub', 'sup',
      'center', 'font',
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'src', 'alt', 'width', 'height',
      'class', 'style',
      'role', 'cellspacing', 'cellpadding', 'border',
      'align', 'valign', 'bgcolor',
      'color', 'face', 'size',
    ],
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|data):/i,
  },

  /** Minimal — only inline formatting, no links or images */
  inline: {
    ALLOWED_TAGS: ['strong', 'em', 'b', 'i', 'u', 's', 'br', 'span', 'sub', 'sup'],
    ALLOWED_ATTR: ['class', 'style'],
  },
};

export type SanitizePreset = keyof typeof PRESET_CONFIGS;

/**
 * Sanitize an HTML string using a named preset.
 *
 * @param html     Raw HTML string
 * @param preset   Whitelist preset name (default: 'richText')
 * @returns        Sanitized HTML safe for dangerouslySetInnerHTML
 *
 * @example
 * <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
 * <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(emailHtml, 'emailPreview') }} />
 */
export function sanitizeHtml(html: string, preset: SanitizePreset = 'richText'): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ...PRESET_CONFIGS[preset] });
}

/**
 * Strip all HTML tags and return plain text.
 * Useful for previews and summaries where no HTML should render.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}
