import type { Node as EditorNode } from '../model/types';
import { docSize, nodeSize } from '../model/position';
import type { Schema } from '../schema/Schema';
import { isDangerousTag } from '../dom/tags';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export interface DomRange {
  from: number;
  to: number;
}

/** A selection expressed in flat model positions. */
export interface EditorSelection {
  from: number;
  to: number;
  empty: boolean;
}

/**
 * Maps DOM nodes (text nodes and elements) to their flat model ranges, by
 * walking the live DOM and the document model in lockstep. The model is always
 * parsed from the DOM before this index is built, so the two trees mirror each
 * other: mark wrappers are "transparent" (they do not advance the model inline
 * index) and unknown/dangerous elements are unwrapped or skipped.
 */
export function buildDOMIndex(
  schema: Schema,
  doc: EditorNode,
  root: HTMLElement,
): Map<globalThis.Node, DomRange> {
  const index = new Map<globalThis.Node, DomRange>();
  indexBlockChildren(schema, root, doc.content ?? [], 0, index);
  return index;
}

/** Walk a container whose children are blocks (doc, bulletList, orderedList). */
function indexBlockChildren(
  schema: Schema,
  container: globalThis.Node,
  blocks: EditorNode[],
  basePos: number,
  index: Map<globalThis.Node, DomRange>,
): void {
  let pos = basePos;
  const domChildren = Array.from(container.childNodes);
  for (let i = 0; i < domChildren.length; i++) {
    const domChild = domChildren[i] as globalThis.Node;
    const block = blocks[i];
    if (!block) break;
    const size = nodeSize(block);

    if (domChild.nodeType === ELEMENT_NODE) {
      indexNode(schema, domChild as Element, block, pos, index);
    } else if (domChild.nodeType === TEXT_NODE) {
      const length = (domChild.textContent ?? '').length;
      index.set(domChild, { from: pos + 1, to: pos + 1 + length });
    }

    pos += size;
  }
}

/** Index a DOM element that corresponds to a model node. */
function indexNode(
  schema: Schema,
  element: Element,
  modelNode: EditorNode,
  pos: number,
  index: Map<globalThis.Node, DomRange>,
): void {
  const size = nodeSize(modelNode);
  index.set(element, { from: pos, to: pos + size });

  if (modelNode.content !== undefined) {
    if (schema.isInlineContent(modelNode.type)) {
      indexInline(schema, element, modelNode.content, pos + 1, index);
    } else {
      indexBlockChildren(schema, element, modelNode.content, pos + 1, index);
    }
  }
}

function indexInline(
  schema: Schema,
  container: Element,
  inline: EditorNode[],
  basePos: number,
  index: Map<globalThis.Node, DomRange>,
): void {
  const state = { mi: 0, pos: basePos };
  walkInline(schema, container, inline, state, index);
}

function walkInline(
  schema: Schema,
  container: Element,
  inline: EditorNode[],
  state: { mi: number; pos: number },
  index: Map<globalThis.Node, DomRange>,
): void {
  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      const value = child.textContent ?? '';
      const model = inline[state.mi];
      const length = model && model.text != null ? model.text.length : 0;
      index.set(child, { from: state.pos, to: state.pos + length });
      if (value.length > 0) {
        state.pos += length;
        state.mi += 1;
      }
    } else if (child.nodeType === ELEMENT_NODE) {
      const element = child as Element;
      const tag = element.tagName.toLowerCase();
      if (isDangerousTag(tag)) continue;
      if (tag === 'br') {
        index.set(element, { from: state.pos, to: state.pos });
        continue;
      }
      const start = state.pos;
      walkInline(schema, element, inline, state, index);
      index.set(element, { from: start, to: state.pos });
    }
  }
}

/**
 * Normalize a DOM selection point to a text-node point, resolving element
 * boundaries to the start of the following child (or the end of the last child
 * for an end-of-container offset).
 */
export function normalizeDomPoint(
  node: globalThis.Node,
  offset: number,
): { node: globalThis.Node; offset: number } {
  if (node.nodeType === TEXT_NODE) return { node, offset };

  const children = node.childNodes;
  if (children.length === 0) return { node, offset: 0 };

  if (offset >= children.length) {
    const last = children[children.length - 1] as globalThis.Node;
    if (last.nodeType === TEXT_NODE) return { node: last, offset: last.textContent?.length ?? 0 };
    return normalizeDomPoint(last, last.childNodes.length);
  }

  const child = children[offset] as globalThis.Node;
  if (child.nodeType === TEXT_NODE) return { node: child, offset: 0 };
  return normalizeDomPoint(child, 0);
}

/** Convert a DOM selection point to a flat model position. */
export function domPointToPosition(
  index: Map<globalThis.Node, DomRange>,
  node: globalThis.Node,
  offset: number,
): number {
  const point = normalizeDomPoint(node, offset);
  const range = index.get(point.node);
  if (!range) return 0;
  if (point.node.nodeType === TEXT_NODE) {
    return Math.min(range.to, range.from + point.offset);
  }
  return range.from;
}

/** Convert a flat model position to a DOM selection point in the fresh DOM. */
export function modelToDomPoint(
  root: HTMLElement,
  doc: EditorNode,
  schema: Schema,
  pos: number,
): { node: globalThis.Node; offset: number } {
  return blockContainerToDomPoint(root, doc.content ?? [], 0, pos, schema);
}

function blockContainerToDomPoint(
  container: globalThis.Node,
  blocks: EditorNode[],
  basePos: number,
  pos: number,
  schema: Schema,
): { node: globalThis.Node; offset: number } {
  let blockPos = basePos;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as EditorNode;
    const size = nodeSize(block);
    if (pos >= blockPos && pos < blockPos + size) {
      const domChild = container.childNodes[i];
      if (domChild && domChild.nodeType === ELEMENT_NODE) {
        return nodeToDomPoint(domChild as Element, block, blockPos, pos, schema);
      }
      return { node: container, offset: i };
    }
    blockPos += size;
  }

  return { node: container, offset: container.childNodes.length };
}

function nodeToDomPoint(
  element: Element,
  modelNode: EditorNode,
  nodePos: number,
  pos: number,
  schema: Schema,
): { node: globalThis.Node; offset: number } {
  if (modelNode.content !== undefined) {
    const contentOffset = pos - nodePos - 1;
    if (schema.isInlineContent(modelNode.type)) {
      return inlineToDomPoint(element, modelNode, contentOffset);
    }
    return blockContainerToDomPoint(element, modelNode.content, 0, contentOffset, schema);
  }
  return { node: element, offset: 0 };
}

function inlineToDomPoint(
  blockDom: Element,
  block: EditorNode,
  contentOffset: number,
): { node: globalThis.Node; offset: number } {
  const inline = block.content ?? [];
  const state = { mi: 0, pos: 0 };

  const walk = (container: Element): { node: globalThis.Node; offset: number } | null => {
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        const model = inline[state.mi];
        const length = model && model.text != null ? model.text.length : 0;
        if (contentOffset >= state.pos && contentOffset <= state.pos + length) {
          return { node: child, offset: contentOffset - state.pos };
        }
        state.pos += length;
        state.mi += 1;
      } else if (child.nodeType === ELEMENT_NODE) {
        const found = walk(child as Element);
        if (found) return found;
      }
    }
    return null;
  };

  const found = walk(blockDom);
  if (found) return found;
  return { node: blockDom, offset: 0 };
}

export { docSize };
