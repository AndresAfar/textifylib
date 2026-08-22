/**
 * TextifyLib document model.
 *
 * The document model is the single source of truth for editor content. It is
 * fully serializable (JSON), predictable and independent from the DOM.
 */

/**
 * A mark decorates inline content (e.g. bold, italic). Marks never have
 * children; they wrap a run of text.
 */
export interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

/**
 * A node in the document tree.
 *
 * Container nodes carry a `content` array of child nodes. Leaf nodes (such as
 * `text`) carry a `text` value. Inline nodes may carry a list of `marks`.
 */
export interface Node {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
  marks?: Mark[];
}

/** A document is just the root node (type `doc`). */
export type Document = Node;

/** Convenience factory for a text node. */
export function text(value: string, marks: Mark[] = []): Node {
  const result: Node = { type: 'text', text: value };
  if (marks.length > 0) result.marks = marks;
  return result;
}

/** Convenience factory for a container node. */
export function node(type: string, content: Node[], attrs?: Record<string, unknown>): Node {
  const result: Node = { type, content };
  if (attrs && Object.keys(attrs).length > 0) result.attrs = attrs;
  return result;
}

/** Returns true when a node is a text (leaf) node. */
export function isText(node: Node): boolean {
  return node.type === 'text';
}
