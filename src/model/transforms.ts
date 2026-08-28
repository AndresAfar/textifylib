import type { Mark, Node as EditorNode } from './types';
import { text } from './types';
import { blocksInSelection, contentSize, marksEqual, nodeSize, rangeHasMark } from './position';

/**
 * Pure document transforms. Each returns a new document (or the same reference
 * when nothing changes), so callers can detect no-ops cheaply.
 */

type MarkUpdate = (marks: Mark[]) => Mark[];

/** Toggle a mark over [from, to]: remove if fully present, otherwise add. */
export function toggleMark(doc: EditorNode, from: number, to: number, mark: Mark): EditorNode {
  if (from === to) return doc;
  const add = !rangeHasMark(doc, from, to, mark);
  const update: MarkUpdate = add
    ? (marks) => (marks.some((m) => marksEqual(m, mark)) ? marks : [...marks, mark])
    : (marks) => marks.filter((m) => !marksEqual(m, mark));
  return applyToRange(doc, from, to, update);
}

/** Force-add a mark over [from, to], replacing any existing mark of the same type. */
export function setMark(doc: EditorNode, from: number, to: number, mark: Mark): EditorNode {
  if (from === to) return doc;
  return applyToRange(doc, from, to, (marks) => [
    ...marks.filter((m) => m.type !== mark.type),
    mark,
  ]);
}

/** Remove all marks of `type` over [from, to]. */
export function removeMark(doc: EditorNode, from: number, to: number, type: string): EditorNode {
  if (from === to) return doc;
  return applyToRange(doc, from, to, (marks) => marks.filter((m) => m.type !== type));
}

/** Add any of `added` not already present over [from, to], preserving existing marks. */
export function addMarks(doc: EditorNode, from: number, to: number, added: Mark[]): EditorNode {
  if (from === to || added.length === 0) return doc;
  return applyToRange(doc, from, to, (marks) => {
    let result = marks;
    for (const mark of added) {
      if (!result.some((m) => marksEqual(m, mark))) result = [...result, mark];
    }
    return result;
  });
}

/** Change the type/attrs of every block covered by [from, to]. */
export function setBlockType(
  doc: EditorNode,
  from: number,
  to: number,
  type: string,
  attrs?: Record<string, unknown>,
): EditorNode {
  const selected = collectSelectedBlockIndices(doc, from, to);
  if (selected.length === 0) return doc;

  let changed = false;
  const content = (doc.content ?? []).map((node, index) => {
    if (!selected.includes(index)) return node;
    if (node.type === type && sameAttrs(node.attrs, attrs)) return node;
    changed = true;
    return {
      type,
      ...(attrs ? { attrs } : {}),
      content: node.content,
    };
  });

  if (!changed) return doc;
  return { ...doc, content };
}

function collectSelectedBlockIndices(doc: EditorNode, from: number, to: number): number[] {
  const indices: number[] = [];
  let pos = 0;
  (doc.content ?? []).forEach((node, index) => {
    const size = nodeSize(node);
    const blockFrom = pos;
    const blockTo = pos + size;
    if (from === to) {
      if (blockFrom <= from && from < blockTo) indices.push(index);
    } else if (blockTo > from && blockFrom < to) {
      indices.push(index);
    }
    pos += size;
  });

  // Collapsed selection at the very end of the document.
  if (from === to && indices.length === 0 && (doc.content ?? []).length > 0) {
    indices.push((doc.content ?? []).length - 1);
  }
  return indices;
}

function applyToRange(doc: EditorNode, from: number, to: number, update: MarkUpdate): EditorNode {
  return { ...doc, content: mapContent(doc.content ?? [], 0, from, to, update) };
}

function mapContent(
  content: EditorNode[],
  base: number,
  from: number,
  to: number,
  update: MarkUpdate,
): EditorNode[] {
  const result: EditorNode[] = [];
  let pos = base;

  for (const node of content) {
    const size = nodeSize(node);
    const nodeFrom = pos;

    if (node.type === 'text') {
      const length = (node.text ?? '').length;
      const localFrom = Math.max(0, from - nodeFrom);
      const localTo = Math.min(length, to - nodeFrom);
      result.push(...splitText(node, localFrom, localTo, update));
    } else if (node.content !== undefined) {
      result.push({ ...node, content: mapContent(node.content, pos + 1, from, to, update) });
    } else {
      result.push(node);
    }

    pos += size;
  }

  return result;
}

function splitText(node: EditorNode, from: number, to: number, update: MarkUpdate): EditorNode[] {
  const value = node.text ?? '';
  const marks = node.marks ?? [];

  const before = value.slice(0, from);
  const middle = value.slice(from, to);
  const after = value.slice(to);

  const parts: EditorNode[] = [];
  if (before.length > 0) parts.push(text(before, marks));
  if (middle.length > 0) parts.push(text(middle, update(marks)));
  if (after.length > 0) parts.push(text(after, marks));
  return parts;
}

function sameAttrs(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => a[key] === b[key]);
}

/**
 * Toggle a list over the selected top-level blocks.
 *
 * When every selected block is already the target list type, the list is lifted
 * back into paragraphs; otherwise the selected blocks are wrapped (and flattened,
 * for nested lists) into a single list of `listType`.
 */
export function toggleList(
  doc: EditorNode,
  from: number,
  to: number,
  listType: 'bulletList' | 'orderedList',
): EditorNode {
  const blocks = blocksInSelection(doc, from, to);
  if (blocks.length === 0) return doc;

  const indices = blocks.map((block) => block.index);
  const allTarget = blocks.every((block) => block.node.type === listType);

  if (allTarget) return liftLists(doc, indices);
  return wrapInList(doc, indices, listType);
}

function wrapInList(doc: EditorNode, indices: number[], listType: string): EditorNode {
  const first = Math.min(...indices);
  const last = Math.max(...indices);

  const items: EditorNode[] = [];
  for (let i = first; i <= last; i++) {
    const block = doc.content?.[i];
    if (!block) continue;
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      items.push(...(block.content ?? []));
    } else {
      items.push({ type: 'listItem', content: block.content ?? [] });
    }
  }

  const list: EditorNode = { type: listType, content: items };
  return { ...doc, content: replaceRange(doc.content ?? [], first, last, [list]) };
}

function liftLists(doc: EditorNode, indices: number[]): EditorNode {
  const first = Math.min(...indices);
  const last = Math.max(...indices);

  const replacement: EditorNode[] = [];
  for (let i = first; i <= last; i++) {
    const block = doc.content?.[i];
    if (!block) continue;
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      for (const item of block.content ?? []) {
        replacement.push({ type: 'paragraph', content: item.content ?? [] });
      }
    } else {
      replacement.push(block);
    }
  }

  return { ...doc, content: replaceRange(doc.content ?? [], first, last, replacement) };
}

function replaceRange(
  content: EditorNode[],
  from: number,
  to: number,
  replacement: EditorNode[],
): EditorNode[] {
  return [...content.slice(0, from), ...replacement, ...content.slice(to + 1)];
}

/**
 * Insert inline content at [from, to], replacing the covered text. Used for
 * pasting a single line of text or inline-only HTML into a block.
 */
export function insertInline(
  doc: EditorNode,
  from: number,
  to: number,
  inline: EditorNode[],
): EditorNode {
  if (inline.length === 0) return doc;
  const loc = locateBlock(doc, from);
  if (!loc) return doc;
  if (loc.node.type === 'bulletList' || loc.node.type === 'orderedList') return doc;

  const content = loc.node.content ?? [];
  const localFrom = Math.max(0, from - loc.blockFrom - 1);
  const localTo = Math.min(contentSize(content), Math.max(localFrom, to - loc.blockFrom - 1));
  const newContent = replaceInlineInContent(content, localFrom, localTo, inline);

  const blocks = (doc.content ?? []).map((block, index) =>
    index === loc.index ? { ...block, content: newContent } : block,
  );
  return { ...doc, content: blocks };
}

/**
 * Replace [from, to] with a list of block nodes, splitting the boundary blocks.
 * Used for pasting multi-paragraph HTML or multi-line text.
 */
export function replaceBlocks(
  doc: EditorNode,
  from: number,
  to: number,
  blocks: EditorNode[],
): EditorNode {
  if (blocks.length === 0) return doc;
  const fromLoc = locateBlock(doc, from);
  const toLoc = locateBlock(doc, Math.max(from, to));
  if (!fromLoc || !toLoc) return doc;

  const prefixBlocks = (doc.content ?? []).slice(0, fromLoc.index);
  const suffixBlocks = (doc.content ?? []).slice(toLoc.index + 1);

  const fromSplit = splitBlock(fromLoc.node, fromLoc.contentOffset);
  const toSplit = splitBlock(toLoc.node, toLoc.contentOffset);

  const middle: EditorNode[] = [];
  if (fromSplit.prefix) middle.push(fromSplit.prefix);
  middle.push(...blocks);
  if (toSplit.suffix) middle.push(toSplit.suffix);

  return { ...doc, content: [...prefixBlocks, ...middle, ...suffixBlocks] };
}

interface BlockLocation {
  index: number;
  node: EditorNode;
  blockFrom: number;
  contentOffset: number;
}

/**
 * Split the text block containing `pos` at `pos`, returning the new document
 * and the flat position at the start of the newly created block.
 *
 * Used to implement the Enter key: content after the caret moves into a new
 * block of the same type. Lists are not split (see `splitListItem` for future
 * list support).
 */
export function splitBlockAt(
  doc: EditorNode,
  pos: number,
): { doc: EditorNode; pos: number } | null {
  const loc = locateBlock(doc, pos);
  if (!loc) return null;
  if (loc.node.type === 'bulletList' || loc.node.type === 'orderedList') return null;

  const { prefix, suffix } = splitInlineContent(loc.node.content ?? [], loc.contentOffset);
  const prefixNode = withContent(loc.node, prefix);
  const suffixNode = withContent(loc.node, suffix);

  const blocks = doc.content ?? [];
  const content = [
    ...blocks.slice(0, loc.index),
    prefixNode,
    suffixNode,
    ...blocks.slice(loc.index + 1),
  ];

  const atStart = loc.contentOffset === 0;
  const newPos = atStart ? loc.blockFrom + 1 : loc.blockFrom + nodeSize(prefixNode) + 1;

  return { doc: { ...doc, content }, pos: newPos };
}

function locateBlock(doc: EditorNode, pos: number): BlockLocation | null {
  let blockPos = 0;
  const blocks = doc.content ?? [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as EditorNode;
    const size = nodeSize(block);
    if (pos >= blockPos && pos < blockPos + size) {
      return {
        index: i,
        node: block,
        blockFrom: blockPos,
        contentOffset: Math.max(0, pos - blockPos - 1),
      };
    }
    blockPos += size;
  }

  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1] as EditorNode;
    const lastSize = nodeSize(last);
    return {
      index: blocks.length - 1,
      node: last,
      blockFrom: blockPos - lastSize,
      contentOffset: contentSize(last.content ?? []),
    };
  }
  return null;
}

function splitBlock(
  block: EditorNode,
  offset: number,
): { prefix: EditorNode | null; suffix: EditorNode | null } {
  // Lists cannot be split in this milestone; they are replaced atomically.
  if (block.type === 'bulletList' || block.type === 'orderedList') {
    return { prefix: null, suffix: null };
  }

  const { prefix, suffix } = splitInlineContent(block.content ?? [], offset);
  const prefixNode = prefix.length > 0 ? withContent(block, prefix) : null;
  const suffixNode = suffix.length > 0 ? withContent(block, suffix) : null;
  return { prefix: prefixNode, suffix: suffixNode };
}

function withContent(block: EditorNode, content: EditorNode[]): EditorNode {
  return {
    type: block.type,
    ...(block.attrs ? { attrs: block.attrs } : {}),
    content,
  };
}

function splitInlineContent(
  inline: EditorNode[],
  offset: number,
): { prefix: EditorNode[]; suffix: EditorNode[] } {
  const prefix: EditorNode[] = [];
  const suffix: EditorNode[] = [];
  let pos = 0;

  for (const node of inline) {
    const length = nodeSize(node);
    const nodeFrom = pos;
    const nodeTo = pos + length;

    if (offset <= nodeFrom) {
      suffix.push(node);
    } else if (offset >= nodeTo) {
      prefix.push(node);
    } else if (node.type === 'text') {
      const local = offset - nodeFrom;
      const value = node.text ?? '';
      const before = value.slice(0, local);
      const after = value.slice(local);
      if (before.length > 0) prefix.push(text(before, node.marks ?? []));
      if (after.length > 0) suffix.push(text(after, node.marks ?? []));
    } else {
      // Leaf inline nodes (e.g. hardBreak) cannot be split; keep them whole.
      suffix.push(node);
    }
    pos += length;
  }

  return { prefix, suffix };
}

function replaceInlineInContent(
  inline: EditorNode[],
  from: number,
  to: number,
  replacement: EditorNode[],
): EditorNode[] {
  if (from === to) return insertInlineInContent(inline, from, replacement);

  const result: EditorNode[] = [];
  let pos = 0;
  let inserted = false;

  for (const node of inline) {
    const length = nodeSize(node);
    const nodeFrom = pos;
    const nodeTo = pos + length;

    if (nodeTo <= from || nodeFrom >= to) {
      result.push(node);
    } else if (node.type === 'text') {
      const localFrom = Math.max(0, from - nodeFrom);
      const localTo = Math.min(length, to - nodeFrom);
      const value = node.text ?? '';
      const before = value.slice(0, localFrom);
      const after = value.slice(localTo);
      if (before.length > 0) result.push(text(before, node.marks ?? []));
      if (!inserted) {
        result.push(...replacement);
        inserted = true;
      }
      if (after.length > 0) result.push(text(after, node.marks ?? []));
    } else {
      // Leaf inline node covered by the range: drop it, insert once.
      if (!inserted) {
        result.push(...replacement);
        inserted = true;
      }
    }
    pos += length;
  }

  if (!inserted) result.push(...replacement);
  return result;
}

function insertInlineInContent(
  inline: EditorNode[],
  pos: number,
  replacement: EditorNode[],
): EditorNode[] {
  const result: EditorNode[] = [];
  let offset = 0;
  let inserted = false;

  for (const node of inline) {
    const length = nodeSize(node);
    const nodeFrom = offset;
    const nodeTo = offset + length;

    if (pos > nodeFrom && pos < nodeTo) {
      const local = pos - nodeFrom;
      const value = node.text ?? '';
      const before = value.slice(0, local);
      const after = value.slice(local);
      if (before.length > 0) result.push(text(before, node.marks ?? []));
      result.push(...replacement);
      inserted = true;
      if (after.length > 0) result.push(text(after, node.marks ?? []));
    } else if (pos <= nodeFrom) {
      if (!inserted) {
        result.push(...replacement);
        inserted = true;
      }
      result.push(node);
    } else {
      result.push(node);
    }
    offset += length;
  }

  if (!inserted) result.push(...replacement);
  return result;
}
