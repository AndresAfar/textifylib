import type { Mark, Node as EditorNode } from '../model/types';
import { node, text } from '../model/types';
import type { NodeSpec, Schema } from '../schema/Schema';
import { isDangerousTag } from '../dom/tags';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Parses an HTML string into the document model.
 *
 * The parser walks the DOM produced by `DOMParser` and reconstructs the tree of
 * model nodes. Only nodes/marks registered in the schema are recognized; any
 * unknown element is unwrapped (its inline children are kept) so that pasted
 * content degrades gracefully instead of polluting the model.
 */
export class HTMLParser {
  constructor(private readonly schema: Schema) {}

  parse(html: string): EditorNode {
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const blocks = this.parseBlocks(dom.body);
    if (blocks.length === 0) {
      blocks.push(node('paragraph', []));
    }
    return node('doc', blocks);
  }

  /** Parse the child nodes of `container` into a list of block nodes. */
  private parseBlocks(container: globalThis.Node): EditorNode[] {
    const blocks: EditorNode[] = [];
    let pendingInline: EditorNode[] = [];

    const flush = (): void => {
      if (pendingInline.length > 0) {
        blocks.push(node('paragraph', pendingInline));
        pendingInline = [];
      }
    };

    container.childNodes.forEach((child) => {
      if (child.nodeType === TEXT_NODE) {
        const value = child.textContent ?? '';
        if (value.trim().length > 0) pendingInline.push(text(value));
        return;
      }
      if (child.nodeType !== ELEMENT_NODE) return;

      const element = child as Element;
      if (isDangerousTag(element.tagName)) return;

      const blockSpec = this.schema.blockNodeForElement(element);
      if (blockSpec) {
        flush();
        const parsed = this.parseBlock(element, blockSpec);
        if (parsed) blocks.push(parsed);
      } else {
        // Unknown block-level wrapper: unwrap and keep its inline content.
        pendingInline.push(...this.parseInlineContent(element));
      }
    });

    flush();
    return blocks;
  }

  private parseBlock(element: Element, spec: NodeSpec): EditorNode | null {
    if (spec.parse) {
      return spec.parse(element, {
        schema: this.schema,
        parseInline: (el, marks) => this.parseInlineContent(el, marks),
      });
    }

    let attrs: Record<string, unknown> | undefined;
    if (spec.getAttrs) {
      const result = spec.getAttrs(element);
      if (result === false) return null;
      attrs = result;
    }
    const content = this.parseInlineContent(element);
    return node(spec.name, content, attrs);
  }

  /** Parse the inline children of `container`, carrying inherited marks. */
  private parseInlineContent(container: Element, marks: Mark[] = []): EditorNode[] {
    // When the container itself is a mark (e.g. a top-level <strong>), fold it
    // into the inherited marks before parsing its children.
    const ownMark = this.schema.markForElement(container);
    if (ownMark) {
      if (ownMark.getAttrs) {
        const attrs = ownMark.getAttrs(container);
        if (attrs === false) return this.collectInline(container, marks);
        const mark: Mark = {
          type: ownMark.name,
          ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
        };
        return this.collectInline(container, [...marks, mark]);
      }
      return this.collectInline(container, [...marks, { type: ownMark.name }]);
    }
    return this.collectInline(container, marks);
  }

  private collectInline(container: Element, marks: Mark[]): EditorNode[] {
    const nodes: EditorNode[] = [];

    container.childNodes.forEach((child) => {
      if (child.nodeType === TEXT_NODE) {
        const value = child.textContent ?? '';
        if (value.length > 0) nodes.push(text(value, marks));
        return;
      }
      if (child.nodeType !== ELEMENT_NODE) return;

      const element = child as Element;
      if (isDangerousTag(element.tagName)) return;

      const markSpec = this.schema.markForElement(element);
      if (markSpec) {
        if (markSpec.getAttrs) {
          const result = markSpec.getAttrs(element);
          if (result === false) {
            // Rejected by getAttrs (e.g. an <a> without href): unwrap it.
            nodes.push(...this.collectInline(element, marks));
            return;
          }
          const mark: Mark = {
            type: markSpec.name,
            ...(Object.keys(result).length > 0 ? { attrs: result } : {}),
          };
          nodes.push(...this.collectInline(element, [...marks, mark]));
          return;
        }
        const mark: Mark = { type: markSpec.name };
        nodes.push(...this.collectInline(element, [...marks, mark]));
        return;
      }

      const inlineSpec = this.schema.inlineNodeForElement(element);
      if (inlineSpec) {
        const attrs = inlineSpec.getAttrs ? inlineSpec.getAttrs(element) : undefined;
        if (attrs === false) {
          nodes.push(...this.collectInline(element, marks));
          return;
        }
        const leaf: EditorNode = { type: inlineSpec.name };
        if (attrs && Object.keys(attrs).length > 0) leaf.attrs = attrs;
        nodes.push(leaf);
      } else {
        // Unknown inline element: unwrap and keep parsing its children.
        nodes.push(...this.collectInline(element, marks));
      }
    });

    return nodes;
  }
}
