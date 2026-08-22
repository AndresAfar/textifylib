import type { MarkSpec, NodeSpec } from '../schema/Schema';
import type { Command, EditorEventHandlers, Extension } from './Extension';

/**
 * Collects the contributions of a list of extensions into flat collections that
 * the editor merges into its schema, command table, shortcut table and events.
 */
export class ExtensionManager {
  readonly nodes: NodeSpec[] = [];
  readonly marks: MarkSpec[] = [];
  readonly commands: Record<string, Command> = {};
  readonly shortcuts: Record<string, string> = {};
  readonly eventHandlers: EditorEventHandlers = {};

  constructor(extensions: Extension[] = []) {
    for (const extension of extensions) {
      if (extension.nodes) this.nodes.push(...extension.nodes);
      if (extension.marks) this.marks.push(...extension.marks);
      if (extension.commands) Object.assign(this.commands, extension.commands);
      if (extension.shortcuts) Object.assign(this.shortcuts, extension.shortcuts);
      if (extension.eventHandlers) Object.assign(this.eventHandlers, extension.eventHandlers);
    }
  }
}
