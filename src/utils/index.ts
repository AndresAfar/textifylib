/**
 * Escapes a string for safe insertion into HTML text content.
 */
export function escapeHTML(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes a string for safe insertion into an HTML attribute value.
 *
 * Single quotes are left as-is: attribute values are emitted inside double
 * quotes, so single quotes need no escaping (this keeps e.g. font stacks
 * readable).
 */
export function escapeAttribute(value: string): string {
  return escapeHTML(value).replace(/"/g, '&quot;');
}

/**
 * Deep-clones a document node tree so callers can never mutate editor state
 * through a returned reference.
 */
export function cloneNode<T>(value: T): T {
  return cloneValue(value) as T;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const array = value as unknown[];
    return array.map((item) => cloneValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = cloneValue(child);
    }
    return result;
  }
  return value;
}

/**
 * Shallow-equality for attribute records. Attributes in the first milestones
 * hold only primitive values (e.g. `href`, `level`).
 */
export function attrsEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}
