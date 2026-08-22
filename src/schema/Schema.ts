import type { Mark, Node } from '../model/types';

/**
 * A DOM output specification describes how a node or mark is rendered to HTML.
 *
 * It mirrors a minimal subset of the ProseMirror DOMOutputSpec concept:
 *   - `string` -> a bare tag name, e.g. `'br'`
 *   - `[tag, attrs]` -> a tag with attributes
 *   - `[tag, attrs, 0]` -> a tag whose child content fills the `0` hole
 */
export type DOMOutputSpec =
  string | [string, Record<string, unknown>?] | [string, Record<string, unknown>?, 0?];

/** Hole marker: indicates where child content is inserted. */
export const DOM_HOLE = 0 as const;

export type NodeGroup = 'root' | 'block' | 'inline' | 'text';

/**
 * Context passed to a node spec's custom `parse` hook, exposing the parser's
 * inline-parsing capability so container nodes (like lists) can build their
 * children without coupling the schema to the parser.
 */
export interface ParseContext {
  schema: Schema;
  parseInline: (element: Element, marks?: Mark[]) => Node[];
}

export interface NodeSpec {
  name: string;
  group: NodeGroup;
  /**
   * Content model expression. A leading `inline` marks the node as holding
   * inline content; anything else is treated as block content. Used by the
   * parser/serializer and selection layer to recurse correctly.
   */
  content?: string;
  /**
   * Optional custom DOM -> model parser. When omitted, the schema falls back to
   * the default block/inline parsing rules.
   */
  parse?: (element: Element, context: ParseContext) => Node | null;
  /** Serialize this node to a DOM output spec. */
  toDOM?: (node: Node) => DOMOutputSpec;
  /** Return attributes from a DOM element, or `false` to reject the match. */
  getAttrs?: (element: Element) => Record<string, unknown> | false;
}

export interface MarkSpec {
  name: string;
  /** DOM tags/styles that identify this mark while parsing HTML. */
  parseDOM: Array<{ tag?: string; style?: string }>;
  toDOM: (mark: Mark) => DOMOutputSpec;
  getAttrs?: (element: Element) => Record<string, unknown> | false;
}

/**
 * The schema registers every node and mark type the editor understands.
 *
 * Extensions will register their own node/mark specs here in later milestones;
 * for the first milestone the schema is built from the built-in specs.
 */
export class Schema {
  readonly nodes: ReadonlyMap<string, NodeSpec>;
  readonly marks: ReadonlyMap<string, MarkSpec>;

  constructor(nodes: NodeSpec[], marks: MarkSpec[]) {
    this.nodes = new Map(nodes.map((spec) => [spec.name, spec]));
    this.marks = new Map(marks.map((spec) => [spec.name, spec]));
  }

  node(name: string): NodeSpec {
    const spec = this.nodes.get(name);
    if (!spec) throw new Error(`Unknown node type: ${name}`);
    return spec;
  }

  mark(name: string): MarkSpec {
    const spec = this.marks.get(name);
    if (!spec) throw new Error(`Unknown mark type: ${name}`);
    return spec;
  }

  /** Find the block node spec that matches the given DOM element, if any. */
  blockNodeForElement(element: Element): NodeSpec | null {
    for (const spec of this.nodes.values()) {
      if (spec.group !== 'block') continue;
      if (spec.getAttrs) {
        const attrs = spec.getAttrs(element);
        if (attrs !== false) return spec;
      }
    }
    return null;
  }

  /** Find the mark spec that matches the given DOM element, if any. */
  markForElement(element: Element): MarkSpec | null {
    const tag = element.tagName.toLowerCase();
    const style = element.getAttribute('style') ?? '';
    for (const spec of this.marks.values()) {
      for (const rule of spec.parseDOM) {
        if (rule.tag && rule.tag.toLowerCase() === tag) return spec;
        if (rule.style && style.includes(rule.style)) return spec;
      }
    }
    return null;
  }

  /** Whether a node type's content is inline (vs block) content. */
  isInlineContent(name: string): boolean {
    return this.node(name).content?.startsWith('inline') ?? false;
  }
}
