import type { Node as EditorNode } from '../model/types';
import { node, text } from '../model/types';
import { posOfTextOffset, textLength, textOffsetOf } from '../model/position';
import { insertInline, replaceBlocks } from '../model/transforms';
import type { HTMLParser } from '../serialization/HTMLParser';
import type { Sanitizer } from '../dom/Sanitizer';
import type { SelectionRange } from '../core/commands';

export interface PasteResult {
  doc: EditorNode;
  selection: SelectionRange;
}

/**
 * Turns clipboard data into a paste transaction: HTML is sanitized and parsed,
 * plain text is wrapped into text nodes, and the result is inserted at the
 * current selection. Arbitrary HTML is never inserted directly.
 */
export class Paste {
  constructor(
    private readonly parser: HTMLParser,
    private readonly sanitizer: Sanitizer,
  ) {}

  createResult(data: DataTransfer, doc: EditorNode, selection: SelectionRange): PasteResult | null {
    const html = data.getData('text/html');
    const plain = data.getData('text/plain');
    const { from, to } = selection;

    if (html) {
      const sanitized = this.sanitizer.sanitize(html);
      const parsed = this.parser.parse(sanitized);
      const blocks = parsed.content ?? [];

      if (blocks.length === 1 && blocks[0]!.type === 'paragraph') {
        return this.inlineResult(doc, from, to, blocks[0]!.content ?? []);
      }
      return this.blockResult(doc, from, to, blocks);
    }

    if (plain) {
      const lines = plain.split(/\r\n|\r|\n/);
      if (lines.length === 1) {
        return this.inlineResult(doc, from, to, [text(lines[0] ?? '')]);
      }
      return this.blockResult(
        doc,
        from,
        to,
        lines.map((line) => node('paragraph', [text(line)])),
      );
    }

    return null;
  }

  private inlineResult(
    doc: EditorNode,
    from: number,
    to: number,
    content: EditorNode[],
  ): PasteResult {
    const next = insertInline(doc, from, to, content);
    const pos = posOfTextOffset(next, textOffsetOf(doc, from) + textLength(content));
    return { doc: next, selection: { from: pos, to: pos } };
  }

  private blockResult(
    doc: EditorNode,
    from: number,
    to: number,
    blocks: EditorNode[],
  ): PasteResult {
    const next = replaceBlocks(doc, from, to, blocks);
    const pos = posOfTextOffset(next, textOffsetOf(doc, from) + textLength(blocks));
    return { doc: next, selection: { from: pos, to: pos } };
  }
}
