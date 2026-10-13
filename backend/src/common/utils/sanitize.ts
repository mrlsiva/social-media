import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/**
 * Strips all HTML tags/attributes from a string, returning plain text.
 * sanitize-html entity-encodes the remaining text (`&` -> `&amp;`), which would
 * then be stored and published verbatim, so those entities are decoded again.
 * Clients must still escape this text when rendering it as HTML.
 */
export function stripHtml(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .trim();
}

/**
 * DTO decorator: trims and strips HTML from string inputs (and string arrays)
 * to prevent stored XSS in content rendered by web/mobile clients.
 */
export const Sanitize = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string') return stripHtml(value);
    if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? stripHtml(v) : v));
    return value;
  });
