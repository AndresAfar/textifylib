import { isDangerousTag } from './tags';

/**
 * HTML sanitization options. Defaults are strict enough for pasted content and
 * can be extended (more blocked tags, fewer allowed URL schemes, ...).
 */
export interface SanitizerOptions {
  /** Additional tag names to remove. */
  blockedTags?: string[];
  /** URL schemes allowed in URL-bearing attributes. */
  allowedSchemes?: string[];
  /** Attribute names that may carry a URL. */
  urlAttributes?: string[];
}

const DEFAULT_BLOCKED_TAGS = ['svg', 'math'];
const DEFAULT_ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel', 'ftp'];
const DEFAULT_URL_ATTRIBUTES = [
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'background',
  'xlink:href',
];

const EVENT_HANDLER = /^on/i;
const SCHEME = /^([a-z][a-z0-9+.-]*):/;

/**
 * Sanitizes untrusted HTML: removes dangerous elements, event-handler
 * attributes, and unsafe URLs (`javascript:`, `data:`, ...). The output is safe
 * to hand to the HTML parser.
 */
export class Sanitizer {
  private readonly blockedTags: Set<string>;
  private readonly allowedSchemes: Set<string>;
  private readonly urlAttributes: Set<string>;

  constructor(options: SanitizerOptions = {}) {
    this.blockedTags = new Set([...DEFAULT_BLOCKED_TAGS, ...(options.blockedTags ?? [])]);
    this.allowedSchemes = new Set(
      (options.allowedSchemes ?? DEFAULT_ALLOWED_SCHEMES).map((scheme) => scheme.toLowerCase()),
    );
    this.urlAttributes = new Set(
      (options.urlAttributes ?? DEFAULT_URL_ATTRIBUTES).map((name) => name.toLowerCase()),
    );
  }

  /** Return a sanitized HTML string. */
  sanitize(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    this.clean(doc.body);
    return doc.body.innerHTML;
  }

  private clean(node: globalThis.Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (this.shouldRemove(element)) {
        element.remove();
        continue;
      }
      this.sanitizeAttributes(element);
      this.clean(element);
    }
  }

  private shouldRemove(element: Element): boolean {
    const tag = element.tagName.toLowerCase();
    return isDangerousTag(tag) || this.blockedTags.has(tag);
  }

  private sanitizeAttributes(element: Element): void {
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (EVENT_HANDLER.test(name)) {
        element.removeAttribute(attr.name);
        continue;
      }
      if (this.urlAttributes.has(name) && !this.isSafeUrl(attr.value)) {
        element.removeAttribute(attr.name);
      }
    }
  }

  private isSafeUrl(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed === '') return true;
    const match = SCHEME.exec(trimmed);
    if (!match) return true; // relative URL (no scheme) is safe
    return this.allowedSchemes.has(match[1]!.toLowerCase());
  }
}
