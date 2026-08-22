/**
 * Tags that must never be inserted into the editor. Elements matching these are
 * dropped entirely while parsing and ignored while mapping DOM positions.
 */
export const DANGEROUS_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'noscript',
  'template',
  'form',
  'input',
  'button',
  'textarea',
  'select',
]);

export function isDangerousTag(tagName: string): boolean {
  return DANGEROUS_TAGS.has(tagName.toLowerCase());
}
