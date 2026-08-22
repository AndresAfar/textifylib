import type { Mark, Node as EditorNode } from '../model/types';
import { DOM_HOLE, type DOMOutputSpec, type Schema } from '../schema/Schema';
import { escapeAttribute, escapeHTML } from '../utils';

interface TextRun {
  text: string;
  marks: Mark[];
}

/**
 * Serializes the document model back to a clean, consistent HTML string.
 *
 * Inline content is serialized with minimal nesting: consecutive text runs that
 * share marks are merged under a single wrapper instead of producing redundant
 * adjacent tags.
 */
export class HTMLSerializer {
  constructor(private readonly schema: Schema) {}

  serialize(doc: EditorNode): string {
    return (doc.content ?? []).map((child) => this.serializeNode(child)).join('');
  }

  private serializeNode(node: EditorNode): string {
    if (node.type === 'text') return this.serializeInline([node]);

    const spec = this.schema.node(node.type);
    const domSpec = spec.toDOM?.(node);

    // Transparent nodes (like `doc`) render their children directly.
    if (!domSpec) return this.serializeChildren(node);

    const inner = this.serializeChildren(node);
    return this.renderSpec(domSpec, inner);
  }

  private serializeChildren(node: EditorNode): string {
    const children = node.content ?? [];

    // Inline-content nodes hold text; containers hold block children.
    if (this.schema.isInlineContent(node.type)) return this.serializeInline(children);
    return children.map((child) => this.serializeNode(child)).join('');
  }

  /** Serialize a flat list of inline nodes with minimal mark nesting. */
  private serializeInline(content: EditorNode[]): string {
    const runs = content.map((node) => this.toRun(node));

    let html = '';
    const open: Mark[] = [];

    for (const run of runs) {
      let common = 0;
      while (
        common < open.length &&
        common < run.marks.length &&
        sameMark(open[common]!, run.marks[common]!)
      ) {
        common += 1;
      }

      for (let i = open.length - 1; i >= common; i--) {
        html += closeMarkTag(this.schema, open[i]!);
      }
      open.length = common;

      for (let i = common; i < run.marks.length; i++) {
        const mark = run.marks[i]!;
        html += openMarkTag(this.schema, mark);
        open.push(mark);
      }

      html += run.text;
    }

    for (let i = open.length - 1; i >= 0; i--) {
      html += closeMarkTag(this.schema, open[i]!);
    }

    return html;
  }

  private toRun(node: EditorNode): TextRun {
    if (node.type === 'text') {
      const order = this.markOrder();
      const marks = [...(node.marks ?? [])].sort(
        (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
      );
      return { text: escapeHTML(node.text ?? ''), marks };
    }
    // Non-text inline nodes (none in the first milestone) serialize standalone.
    return { text: this.serializeNode(node), marks: [] };
  }

  private markOrder(): string[] {
    return Array.from(this.schema.marks.keys());
  }

  private renderSpec(domSpec: DOMOutputSpec, inner: string): string {
    if (typeof domSpec === 'string') {
      return `<${domSpec}>`;
    }

    const [tag, attrs, hole] = domSpec;
    const attrString = attrs ? serializeAttributes(attrs) : '';

    if (hole === DOM_HOLE) {
      return `<${tag}${attrString}>${inner}</${tag}>`;
    }
    return `<${tag}${attrString}></${tag}>`;
  }
}

function sameMark(a: Mark, b: Mark): boolean {
  return a.type === b.type && a.attrs === b.attrs;
}

function openMarkTag(schema: Schema, mark: Mark): string {
  return `<${tagOf(schema, mark)}${attrStringOf(schema, mark)}>`;
}

function closeMarkTag(schema: Schema, mark: Mark): string {
  return `</${tagOf(schema, mark)}>`;
}

function tagOf(schema: Schema, mark: Mark): string {
  const domSpec = schema.mark(mark.type).toDOM(mark);
  return typeof domSpec === 'string' ? domSpec : domSpec[0];
}

function attrStringOf(schema: Schema, mark: Mark): string {
  const domSpec = schema.mark(mark.type).toDOM(mark);
  if (typeof domSpec === 'string') return '';
  return domSpec[1] ? serializeAttributes(domSpec[1]) : '';
}

function serializeAttributes(attrs: Record<string, unknown>): string {
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeAttribute(String(value))}"`)
    .join('');
}
