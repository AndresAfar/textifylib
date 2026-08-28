/** Generic CSS font categories used to group and give fallbacks to fonts. */
export type FontFamilyCategory = 'sans-serif' | 'serif' | 'monospace' | 'cursive';

/** A curated, selectable font family. */
export interface FontFamilyOption {
  /** Human-readable name shown in the UI. */
  label: string;
  /** CSS `font-family` value (including a generic fallback). */
  value: string;
  /** Generic CSS category, for grouping and fallbacks. */
  category: FontFamilyCategory;
}

/**
 * Curated list of fonts available through the `fontFamily` command.
 *
 * The `value` is a full CSS `font-family` stack so the editor produces
 * self-contained HTML that degrades to a sensible generic family when a font is
 * not installed.
 */
export const FONT_FAMILIES: FontFamilyOption[] = [
  { label: 'Inter', value: 'Inter, sans-serif', category: 'sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif', category: 'sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif', category: 'sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, sans-serif', category: 'sans-serif' },
  { label: 'Verdana', value: 'Verdana, sans-serif', category: 'sans-serif' },
  { label: 'Trebuchet MS', value: "'Trebuchet MS', sans-serif", category: 'sans-serif' },

  { label: 'Times New Roman', value: "'Times New Roman', serif", category: 'serif' },
  { label: 'Georgia', value: 'Georgia, serif', category: 'serif' },
  { label: 'Garamond', value: 'Garamond, serif', category: 'serif' },
  { label: 'Merriweather', value: 'Merriweather, serif', category: 'serif' },
  { label: 'Playfair Display', value: "'Playfair Display', serif", category: 'serif' },

  { label: 'Ubuntu Mono', value: "'Ubuntu Mono', monospace", category: 'monospace' },
  { label: 'Inconsolata', value: 'Inconsolata, monospace', category: 'monospace' },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace", category: 'monospace' },
  { label: 'Fira Code', value: "'Fira Code', monospace", category: 'monospace' },
  { label: 'Courier New', value: "'Courier New', monospace", category: 'monospace' },

  { label: 'Comic Sans MS', value: "'Comic Sans MS', cursive", category: 'cursive' },
];

/**
 * Canonicalize a `font-family` value read back from the DOM. Browsers report
 * the value with double quotes; the editor authors values with single quotes,
 * so we normalize here to keep round-trips byte-stable.
 */
export function normalizeFontFamily(value: string): string {
  return value.replace(/"/g, "'");
}
