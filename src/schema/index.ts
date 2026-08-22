import { Schema } from './Schema';
import { builtinMarks, builtinNodes } from './nodes';

let defaultSchema: Schema | undefined;

/** Returns a shared default schema built from the built-in node/mark specs. */
export function getDefaultSchema(): Schema {
  if (!defaultSchema) {
    defaultSchema = new Schema(builtinNodes, builtinMarks);
  }
  return defaultSchema;
}

/** Create a fresh schema instance (used by extensions in later milestones). */
export function createSchema(nodes = builtinNodes, marks = builtinMarks): Schema {
  return new Schema(nodes, marks);
}

export { Schema, DOM_HOLE } from './Schema';
export type { DOMOutputSpec, NodeSpec, MarkSpec, NodeGroup, ParseContext } from './Schema';
export { builtinNodes, builtinMarks } from './nodes';
