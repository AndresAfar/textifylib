import { afterEach, describe, expect, it } from 'vitest';
import {
  HTMLParser,
  HTMLSerializer,
  createEditor,
  getDefaultSchema,
  node,
  text,
  type Editor,
} from '../src';

let editors: Editor[] = [];

function makeEditor(content: string): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element, content });
  editors.push(editor);
  return editor;
}

function collectTextNodes(root: Element): { node: Text; length: number }[] {
  const result: { node: Text; length: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const length = node.textContent?.length ?? 0;
    if (length > 0) result.push({ node, length });
    current = walker.nextNode();
  }
  return result;
}

function selectFlat(editor: Editor, from: number, to: number): void {
  const textNodes = collectTextNodes(editor.element);
  const range = document.createRange();
  let start: { node: Text; offset: number } | null = null;
  let end: { node: Text; offset: number } | null = null;
  let pos = 0;

  for (const item of textNodes) {
    if (start === null && pos + item.length > from) start = { node: item.node, offset: from - pos };
    if (pos + item.length >= to) {
      end = { node: item.node, offset: to - pos };
      break;
    }
    pos += item.length;
  }
  if (start === null) {
    const last = textNodes[textNodes.length - 1]!;
    start = { node: last.node, offset: last.length };
  }
  if (end === null) end = start;

  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function setCaret(editor: Editor, offset: number): void {
  selectFlat(editor, offset, offset);
}

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('list parsing and serialization', () => {
  const parser = new HTMLParser(getDefaultSchema());
  const serializer = new HTMLSerializer(getDefaultSchema());

  it('parses an unordered list', () => {
    expect(parser.parse('<ul><li>One</li><li>Two</li></ul>')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'text', text: 'One' }] },
            { type: 'listItem', content: [{ type: 'text', text: 'Two' }] },
          ],
        },
      ],
    });
  });

  it('parses an ordered list', () => {
    expect(parser.parse('<ol><li>First</li></ol>')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [{ type: 'text', text: 'First' }] }],
        },
      ],
    });
  });

  it('serializes a bullet list', () => {
    const doc = node('doc', [
      node('bulletList', [node('listItem', [text('One')]), node('listItem', [text('Two')])]),
    ]);
    expect(serializer.serialize(doc)).toBe('<ul><li>One</li><li>Two</li></ul>');
  });

  it('serializes an ordered list', () => {
    const doc = node('doc', [node('orderedList', [node('listItem', [text('First')])])]);
    expect(serializer.serialize(doc)).toBe('<ol><li>First</li></ol>');
  });

  it('round-trips a list through the editor', () => {
    const editor = makeEditor('<ul><li>One</li><li>Two</li></ul>');
    expect(editor.getHTML()).toBe('<ul><li>One</li><li>Two</li></ul>');
    expect(editor.getText()).toBe('One\nTwo');
  });
});

describe('list commands', () => {
  it('wraps selected paragraphs in a bullet list', () => {
    const editor = makeEditor('<p>One</p><p>Two</p>');
    selectFlat(editor, 0, 6);
    expect(editor.commands.bulletList()).toBe(true);
    expect(editor.getHTML()).toBe('<ul><li>One</li><li>Two</li></ul>');
  });

  it('wraps a single paragraph in an ordered list', () => {
    const editor = makeEditor('<p>One</p>');
    setCaret(editor, 0);
    expect(editor.commands.orderedList()).toBe(true);
    expect(editor.getHTML()).toBe('<ol><li>One</li></ol>');
  });

  it('toggles a list back to paragraphs', () => {
    const editor = makeEditor('<ul><li>One</li><li>Two</li></ul>');
    setCaret(editor, 0);
    expect(editor.commands.bulletList()).toBe(true);
    expect(editor.getHTML()).toBe('<p>One</p><p>Two</p>');
  });

  it('switches an ordered list to a bullet list', () => {
    const editor = makeEditor('<ol><li>One</li></ol>');
    setCaret(editor, 0);
    expect(editor.commands.bulletList()).toBe(true);
    expect(editor.getHTML()).toBe('<ul><li>One</li></ul>');
  });

  it('preserves marks inside list items', () => {
    const editor = makeEditor('<p><strong>Bold</strong> item</p>');
    setCaret(editor, 0);
    editor.commands.bulletList();
    expect(editor.getHTML()).toBe('<ul><li><strong>Bold</strong> item</li></ul>');
  });

  it('restores the selection across the structural change', () => {
    const editor = makeEditor('<p>One</p>');
    selectFlat(editor, 0, 3);
    editor.commands.bulletList();

    const sel = editor.getSelection()!;
    expect(sel.empty).toBe(false);
    expect(sel.from).toBe(2);
    expect(sel.to).toBe(5);
  });

  it('exposes can() for list commands', () => {
    const editor = makeEditor('<p>One</p>');
    setCaret(editor, 0);
    expect(editor.can().bulletList()).toBe(true);
    expect(editor.can().orderedList()).toBe(true);
  });
});
