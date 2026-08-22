/**
 * Keyboard shortcut handling.
 *
 * Shortcuts are key combos expressed as strings such as `'Mod-b'` or
 * `'Mod-Shift-z'`. `Mod` maps to Ctrl on Windows/Linux and Cmd on macOS.
 * Combo parts may appear in any order; they are normalized to
 * `mod-alt-shift-key`.
 */

export type CommandRunner = (name: string) => boolean;

const MOD_KEYS = new Set(['mod', 'ctrl', 'cmd', 'meta', 'control']);

/** Normalize a combo string to the canonical `mod-alt-shift-key` form. */
export function normalizeCombo(combo: string): string {
  let hasMod = false;
  let hasAlt = false;
  let hasShift = false;
  let key = '';

  for (const raw of combo.split('-')) {
    const part = raw.toLowerCase();
    if (MOD_KEYS.has(part)) hasMod = true;
    else if (part === 'alt' || part === 'option') hasAlt = true;
    else if (part === 'shift') hasShift = true;
    else key = part;
  }

  const parts: string[] = [];
  if (hasMod) parts.push('mod');
  if (hasAlt) parts.push('alt');
  if (hasShift) parts.push('shift');
  parts.push(key);
  return parts.join('-');
}

/** Derive the canonical combo string for a keyboard event. */
export function eventToCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('mod');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(event.key.toLowerCase());
  return parts.join('-');
}

/** Handles keydown events and dispatches matching shortcuts. */
export class Keyboard {
  private readonly shortcuts = new Map<string, string>();

  constructor(private readonly runCommand: CommandRunner) {}

  addShortcuts(shortcuts: Record<string, string>): void {
    for (const [combo, command] of Object.entries(shortcuts)) {
      this.shortcuts.set(normalizeCombo(combo), command);
    }
  }

  bind(element: HTMLElement): void {
    element.addEventListener('keydown', this.handleKeydown);
  }

  unbind(element: HTMLElement): void {
    element.removeEventListener('keydown', this.handleKeydown);
  }

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.isComposing) return;
    const command = this.shortcuts.get(eventToCombo(event));
    if (!command) return;
    event.preventDefault();
    this.runCommand(command);
  };
}
