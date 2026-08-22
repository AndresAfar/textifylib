import { node, type Node as EditorNode } from '../model/types';
import { DOM_HOLE, type MarkSpec, type NodeSpec, type ParseContext } from './Schema';

/**
 * Built-in node specs.
 *
 * Supported nodes: doc, paragraph, heading, bulletList, orderedList, listItem,
 * text.
 */
export const builtinNodes: NodeSpec[] = [
  {
    name: 'doc',
    group: 'root',
    content: 'block*',
    // The doc node has no DOM representation; its block children are rendered
    // directly into the contenteditable root, so no `toDOM` is defined.
  },
  {
    name: 'paragraph',
    group: 'block',
    content: 'inline*',
    getAttrs: (element) => (element.tagName.toLowerCase() === 'p' ? {} : false),
    toDOM: () => ['p', {}, DOM_HOLE],
  },
  {
    name: 'heading',
    group: 'block',
    content: 'inline*',
    getAttrs: (element) => {
      const tag = element.tagName.toLowerCase();
      const match = /^h([1-6])$/.exec(tag);
      return match ? { level: Number(match[1]) } : false;
    },
    toDOM: (node) => {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
      return [`h${level}`, {}, DOM_HOLE];
    },
  },
  {
    name: 'bulletList',
    group: 'block',
    content: 'listItem+',
    getAttrs: (element) => (element.tagName.toLowerCase() === 'ul' ? {} : false),
    toDOM: () => ['ul', {}, DOM_HOLE],
    parse: (element, context) => node('bulletList', parseListItems(element, context)),
  },
  {
    name: 'orderedList',
    group: 'block',
    content: 'listItem+',
    getAttrs: (element) => (element.tagName.toLowerCase() === 'ol' ? {} : false),
    toDOM: () => ['ol', {}, DOM_HOLE],
    parse: (element, context) => node('orderedList', parseListItems(element, context)),
  },
  {
    name: 'listItem',
    group: 'block',
    content: 'inline*',
    getAttrs: (element) => (element.tagName.toLowerCase() === 'li' ? {} : false),
    toDOM: () => ['li', {}, DOM_HOLE],
    parse: (element, context) => node('listItem', context.parseInline(element)),
  },
  {
    name: 'text',
    group: 'text',
  },
];

function parseListItems(element: Element, context: ParseContext): EditorNode[] {
  const items: EditorNode[] = [];
  element.childNodes.forEach((child) => {
    if (child.nodeType !== 1) return;
    const listItem = child as Element;
    if (listItem.tagName.toLowerCase() !== 'li') return;
    items.push(node('listItem', context.parseInline(listItem)));
  });
  return items;
}

/**
 * Built-in mark specs.
 *
 * Supported marks: bold, italic, underline, strike, link.
 */
export const builtinMarks: MarkSpec[] = [
  {
    name: 'bold',
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: () => ['strong', {}, DOM_HOLE],
  },
  {
    name: 'italic',
    parseDOM: [{ tag: 'em' }, { tag: 'i' }],
    toDOM: () => ['em', {}, DOM_HOLE],
  },
  {
    name: 'underline',
    parseDOM: [{ tag: 'u' }],
    toDOM: () => ['u', {}, DOM_HOLE],
  },
  {
    name: 'strike',
    parseDOM: [{ tag: 's' }, { tag: 'strike' }, { tag: 'del' }],
    toDOM: () => ['s', {}, DOM_HOLE],
  },
  {
    name: 'link',
    parseDOM: [{ tag: 'a' }],
    getAttrs: (element) => {
      const href = element.getAttribute('href');
      return href ? { href } : false;
    },
    toDOM: (mark) => {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
      return ['a', { href }, DOM_HOLE];
    },
  },
];
