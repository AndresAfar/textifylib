import type { Mark, Node as EditorNode } from './types';
import { attrsEqual } from '../utils';

/**
 * Flat document positions (ProseMirror-style).
 *
 * Positions are integer offsets over the document. A text node occupies
 * `text.length` positions; every non-text leaf node occupies `1`; a container
 * node occupies `2 + content.size` positions (one for its opening boundary and
 * one for its closing boundary).
 */

export function nodeSize(node: EditorNode): number {
  if (node.type === 'text') return (node.text ?? '').length;
  if (node.content === undefined) return 1;
  return 2 + contentSize(node.content);
}

export function contentSize(content: EditorNode[]): number {
  let size = 0;
  for (const node of content) size += nodeSize(node);
  return size;
}

export function docSize(doc: EditorNode): number {
  return contentSize(doc.content ?? []);
}

export interface TextRange {
  node: EditorNode;
  from: number;
  to: number;
}

/** Visit every text node in the document with its flat [from, to) range. */
export function iterTextNodes(doc: EditorNode, visit: (range: TextRange) => void): void {
  walkText(doc.content ?? [], 0, visit);
}

/** Collect every text node's flat [from, to) range. */
export function textRanges(doc: EditorNode): TextRange[] {
  const ranges: TextRange[] = [];
  iterTextNodes(doc, (range) => ranges.push(range));
  return ranges;
}

/**
 * The number of characters strictly before flat position `pos`. Structural
 * transforms preserve text, so this stays stable across restructuring.
 */
export function textOffsetOf(doc: EditorNode, pos: number): number {
  let offset = 0;
  for (const range of textRanges(doc)) {
    if (pos <= range.from) break;
    offset += Math.min(pos, range.to) - range.from;
  }
  return offset;
}

/** The flat position at the given character offset into the document's text. */
export function posOfTextOffset(doc: EditorNode, textOffset: number): number {
  for (const range of textRanges(doc)) {
    const length = range.to - range.from;
    if (textOffset <= length) return range.from + textOffset;
    textOffset -= length;
  }
  return docSize(doc);
}

/** Total number of text characters in a list of nodes. */
export function textLength(nodes: EditorNode[]): number {
  let length = 0;
  for (const node of nodes) {
    if (node.type === 'text') length += (node.text ?? '').length;
    else if (node.content !== undefined) length += textLength(node.content);
  }
  return length;
}

function walkText(content: EditorNode[], base: number, visit: (range: TextRange) => void): void {
  let pos = base;
  for (const node of content) {
    if (node.type === 'text') {
      const length = (node.text ?? '').length;
      visit({ node, from: pos, to: pos + length });
      pos += length;
    } else if (node.content !== undefined) {
      walkText(node.content, pos + 1, visit);
      pos += nodeSize(node);
    } else {
      pos += 1;
    }
  }
}

export interface BlockRange {
  index: number;
  node: EditorNode;
  from: number;
  to: number;
}

/** Visit every top-level block with its flat [from, to) range. */
export function iterBlocks(doc: EditorNode, visit: (range: BlockRange) => void): void {
  let pos = 0;
  (doc.content ?? []).forEach((node, index) => {
    const size = nodeSize(node);
    visit({ index, node, from: pos, to: pos + size });
    pos += size;
  });
}

/** The block containing `pos`, or the last block when `pos` is at the end. */
export function blockAt(doc: EditorNode, pos: number): BlockRange | null {
  let fallback: BlockRange | null = null;
  iterBlocks(doc, (block) => {
    if (block.from <= pos && pos < block.to) fallback = block;
  });
  if (fallback) return fallback;

  // pos === docSize: return the last block.
  const blocks = doc.content ?? [];
  if (blocks.length === 0) return null;
  let last: BlockRange | null = null;
  iterBlocks(doc, (block) => (last = block));
  return last;
}

/** Blocks covered by the selection [from, to]. */
export function blocksInSelection(doc: EditorNode, from: number, to: number): BlockRange[] {
  if (from === to) {
    const block = blockAt(doc, from);
    return block ? [block] : [];
  }
  const result: BlockRange[] = [];
  iterBlocks(doc, (block) => {
    if (block.to > from && block.from < to) result.push(block);
  });
  return result;
}

/** Marks of the text node before/at position `pos` (used for a caret). */
export function marksAt(doc: EditorNode, pos: number): Mark[] {
  if (pos > 0) pos -= 1;
  let result: Mark[] = [];
  iterTextNodes(doc, (range) => {
    if (range.from <= pos && pos < range.to) result = range.node.marks ?? [];
  });
  return result;
}

/** Marks shared by every piece of text in [from, to]. */
export function commonMarks(doc: EditorNode, from: number, to: number): Mark[] {
  let result: Mark[] | null = null;
  iterTextNodes(doc, (range) => {
    if (range.to <= from || range.from >= to) return;
    const marks = range.node.marks ?? [];
    if (result === null) {
      result = [...marks];
    } else {
      result = result.filter((m) => marks.some((other) => marksEqual(other, m)));
    }
  });
  return result ?? [];
}

/** Whether every piece of text in [from, to] carries the given mark. */
export function rangeHasMark(doc: EditorNode, from: number, to: number, mark: Mark): boolean {
  let covered = false;
  let all = true;
  iterTextNodes(doc, (range) => {
    if (range.to <= from || range.from >= to) return;
    const nodeHas = (range.node.marks ?? []).some((m) => marksEqual(m, mark));
    covered = true;
    if (!nodeHas) all = false;
  });
  return covered && all;
}

/** Whether every piece of text in [from, to] carries a mark of `type`. */
export function rangeHasMarkType(doc: EditorNode, from: number, to: number, type: string): boolean {
  let covered = false;
  let all = true;
  iterTextNodes(doc, (range) => {
    if (range.to <= from || range.from >= to) return;
    const nodeHas = (range.node.marks ?? []).some((m) => m.type === type);
    covered = true;
    if (!nodeHas) all = false;
  });
  return covered && all;
}

export function marksEqual(a: Mark, b: Mark): boolean {
  return a.type === b.type && attrsEqual(a.attrs, b.attrs);
}
