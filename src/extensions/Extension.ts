import type { EditorEvents } from '../core/Editor';
import type { CommandContext } from '../core/commands';
import type { MarkSpec, NodeSpec } from '../schema/Schema';

/** A command implementation: receives the command context, returns success. */
export type Command = (context: CommandContext) => boolean;

/** Event subscriptions an extension may register at editor creation time. */
export type EditorEventHandlers = {
  [K in keyof EditorEvents]?: (payload: EditorEvents[K]) => void;
};

/**
 * An extension contributes to the editor: node and mark specs, commands,
 * keyboard shortcuts, and event handlers.
 *
 * Extensions are the primary extension point of TextifyLib. They are resolved
 * at creation time and merged into the editor's schema, command table, shortcut
 * table, and event emitter.
 */
export interface Extension {
  /** Unique extension name (used for diagnostics). */
  name: string;
  nodes?: NodeSpec[];
  marks?: MarkSpec[];
  commands?: Record<string, Command>;
  /** Map of key combos (e.g. `'Mod-b'`) to command names. */
  shortcuts?: Record<string, string>;
  eventHandlers?: EditorEventHandlers;
}
