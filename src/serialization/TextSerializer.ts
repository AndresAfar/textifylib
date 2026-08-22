import type { Node as EditorNode } from '../model/types';

/**
 * Extracts the plain text representation of a document.
 *
 * Top-level blocks are separated by a newline; list items within a list are also
 * separated by a newline; inline text is concatenated with no separator.
 */
export function getPlainText(doc: EditorNode): string {
  return (doc.content ?? []).map(blockText).join('\n');
}

function blockText(node: EditorNode): string {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content ?? []).map(nodeText).join('\n');
  }
  return nodeText(node);
}

function nodeText(node: EditorNode): string {
  if (node.text != null) return node.text;
  return (node.content ?? []).map(nodeText).join('');
}
