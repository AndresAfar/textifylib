import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, type Editor } from '../src';

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

/** Select flat character range [from, to) across the whole editor content. */
function selectFlat(editor: Editor, from: number, to: number): void {
  const textNodes = collectTextNodes(editor.element);
  const range = document.createRange();

  let start: { node: Text; offset: number } | null = null;
  let end: { node: Text; offset: number } | null = null;
  let pos = 0;

  for (const item of textNodes) {
    if (start === null && pos + item.length > from) {
      start = { node: item.node, offset: from - pos };
    }
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

  const startPoint = start;
  const endPoint = end;
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function setCaret(editor: Editor, offset: number): void {
  selectFlat(editor, offset, offset);
}

/** Simulate typing at the current caret, then fire the `input` event. */
function typeText(editor: Editor, text: string): void {
  const sel = window.getSelection()!;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  editor.element.dispatchEvent(new Event('input'));
}

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('mark commands', () => {
  it('bold toggles on a selection', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);
    expect(editor.commands.bold()).toBe(true);
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong> world</p>');
  });

  it('bold toggles off when already active', () => {
    const editor = makeEditor('<p><strong>Hello</strong> world</p>');
    selectFlat(editor, 0, 5);
    expect(editor.commands.bold()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
  });

  it('italic, underline and strike apply their tags', () => {
    const editor = makeEditor('<p>text</p>');
    selectFlat(editor, 0, 4);
    editor.commands.italic();
    editor.commands.underline();
    editor.commands.strike();
    expect(editor.getHTML()).toBe('<p><em><u><s>text</s></u></em></p>');
  });

  it('stores a mark at a collapsed selection instead of applying it', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 1);
    expect(editor.commands.bold()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Hello</p>');
    expect(editor.isActive('bold')).toBe(true);
  });
});

describe('stored marks', () => {
  it('applies a stored mark to subsequently typed text', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 5);
    expect(editor.commands.bold()).toBe(true);
    typeText(editor, '!');
    expect(editor.getHTML()).toBe('<p>Hello<strong>!</strong></p>');
  });

  it('toggles a stored mark off again', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 5);
    expect(editor.commands.bold()).toBe(true);
    expect(editor.commands.bold()).toBe(true);
    expect(editor.isActive('bold')).toBe(false);
    typeText(editor, '!');
    expect(editor.getHTML()).toBe('<p>Hello!</p>');
  });

  it('applies a stored font family to subsequently typed text', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 5);
    expect(editor.commands.fontFamily("'Ubuntu Mono', monospace")).toBe(true);
    typeText(editor, '!');
    expect(editor.getHTML()).toBe(
      `<p>Hello<span style="font-family: 'Ubuntu Mono', monospace">!</span></p>`,
    );
  });
});

describe('heading and paragraph commands', () => {
  it('applies a heading level to the block', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 0);
    expect(editor.commands.heading(2)).toBe(true);
    expect(editor.getHTML()).toBe('<h2>Hello</h2>');
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });
  });

  it('clamps heading levels to 1..6', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 0);
    editor.commands.heading(99);
    expect(editor.getHTML()).toBe('<h6>Hello</h6>');
  });

  it('converts a heading back to a paragraph', () => {
    const editor = makeEditor('<h1>Title</h1>');
    setCaret(editor, 0);
    expect(editor.commands.paragraph()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Title</p>');
  });

  it('changes all selected blocks', () => {
    const editor = makeEditor('<p>One</p><p>Two</p>');
    selectFlat(editor, 0, 6);
    editor.commands.heading(3);
    expect(editor.getHTML()).toBe('<h3>One</h3><h3>Two</h3>');
  });
});

describe('link commands', () => {
  it('adds a link', () => {
    const editor = makeEditor('<p>Visit the site</p>');
    selectFlat(editor, 0, 5);
    expect(editor.commands.link({ href: 'https://example.com' })).toBe(true);
    expect(editor.getHTML()).toBe('<p><a href="https://example.com">Visit</a> the site</p>');
  });

  it('unlinks', () => {
    const editor = makeEditor('<p><a href="https://example.com">Visit</a> the site</p>');
    selectFlat(editor, 0, 5);
    expect(editor.commands.unlink()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Visit the site</p>');
  });

  it('rejects a link without an href', () => {
    const editor = makeEditor('<p>Visit</p>');
    selectFlat(editor, 0, 5);
    expect(editor.commands.link({ href: '' })).toBe(false);
    expect(editor.getHTML()).toBe('<p>Visit</p>');
  });
});

describe('isActive', () => {
  it('reports an active mark on a selection', () => {
    const editor = makeEditor('<p><strong>bold</strong> and normal</p>');
    selectFlat(editor, 0, 4);
    expect(editor.isActive('bold')).toBe(true);
  });

  it('reports a mark at the caret', () => {
    const editor = makeEditor('<p><strong>bold</strong> and normal</p>');
    setCaret(editor, 2);
    expect(editor.isActive('bold')).toBe(true);
  });

  it('reports an active heading node', () => {
    const editor = makeEditor('<h2>Heading</h2>');
    setCaret(editor, 0);
    expect(editor.isActive('heading')).toBe(true);
    expect(editor.isActive('heading', { level: 2 })).toBe(true);
    expect(editor.isActive('heading', { level: 3 })).toBe(false);
    expect(editor.isActive('paragraph')).toBe(false);
  });

  it('reports link activity with attributes', () => {
    const editor = makeEditor('<p><a href="https://x.example">link</a></p>');
    selectFlat(editor, 0, 4);
    expect(editor.isActive('link')).toBe(true);
    expect(editor.isActive('link', { href: 'https://x.example' })).toBe(true);
    expect(editor.isActive('link', { href: 'https://other.example' })).toBe(false);
  });
});

describe('can()', () => {
  it('reflects whether a mark command can run', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 1);
    expect(editor.can().bold()).toBe(true);

    selectFlat(editor, 0, 3);
    expect(editor.can().bold()).toBe(true);
  });

  it('reflects whether a block command can run', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 0);
    expect(editor.can().heading(2)).toBe(true);
  });
});
