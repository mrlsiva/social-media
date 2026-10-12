import { Transform } from 'class-transformer';
import sanitizeHtml from 'sanitize-html';

/** Strips all HTML tags/attributes from a string. */
export function stripHtml(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim();
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
