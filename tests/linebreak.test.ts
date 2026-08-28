import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, type Editor } from '../src';

let editors: Editor[] = [];

function makeEditor(content?: string): Editor {
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

function setCaret(editor: Editor, offset: number): void {
  const textNodes = collectTextNodes(editor.element);
  const range = document.createRange();
  let pos = 0;
  let point: { node: Text; offset: number } | null = null;

  for (const item of textNodes) {
    if (pos + item.length >= offset) {
      point = { node: item.node, offset: offset - pos };
      break;
    }
    pos += item.length;
  }
  if (point === null) {
    const last = textNodes[textNodes.length - 1]!;
    point = { node: last.node, offset: last.length };
  }

  range.setStart(point.node, point.offset);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

function pressEnter(editor: Editor, shift = false): void {
  editor.element.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }),
  );
}

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

function dispatchBeforeInput(editor: Editor, inputType: string): void {
  editor.element.dispatchEvent(
    new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }),
  );
}

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('Enter key (split block)', () => {
  it('splits a paragraph at the caret', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    pressEnter(editor);
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>');
  });

  it('places the caret at the start of the new block', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    pressEnter(editor);
    expect(editor.getSelection()).toEqual({ from: 4, to: 4, empty: true });
  });

  it('creates an empty block above when Enter is pressed at the start', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 0);
    pressEnter(editor);
    expect(editor.getHTML()).toBe('<p></p><p>Hello</p>');
  });

  it('creates an empty block below when Enter is pressed at the end', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 5);
    pressEnter(editor);
    expect(editor.getHTML()).toBe('<p>Hello</p><p></p>');
  });

  it('splits correctly after typing', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 5);
    typeText(editor, ' world');
    pressEnter(editor);
    expect(editor.getHTML()).toBe('<p>Hello world</p><p></p>');
  });
});

describe('beforeinput fallback', () => {
  it('splits the block on insertParagraph', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    dispatchBeforeInput(editor, 'insertParagraph');
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>');
  });

  it('inserts a hard break on insertLineBreak', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    dispatchBeforeInput(editor, 'insertLineBreak');
    expect(editor.getHTML()).toBe('<p>a<br>b</p>');
  });

  it('does not double-handle when both keydown and beforeinput fire', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    pressEnter(editor);
    dispatchBeforeInput(editor, 'insertParagraph');
    expect(editor.getHTML()).toBe('<p>a</p><p>b</p>');
  });
});

describe('Shift+Enter key (hard break)', () => {
  it('inserts a hard break within the paragraph', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    pressEnter(editor, true);
    expect(editor.getHTML()).toBe('<p>a<br>b</p>');
  });

  it('places the caret after the hard break', () => {
    const editor = makeEditor('<p>ab</p>');
    setCaret(editor, 1);
    pressEnter(editor, true);
    expect(editor.getSelection()).toEqual({ from: 3, to: 3, empty: true });
  });
});

describe('hard break parsing and serialization', () => {
  it('round-trips a <br> element', () => {
    const editor = makeEditor('<p>Hello<br>world</p>');
    expect(editor.getHTML()).toBe('<p>Hello<br>world</p>');
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'hardBreak' },
            { type: 'text', text: 'world' },
          ],
        },
      ],
    });
  });

  it('extracts hard breaks as newlines in plain text', () => {
    const editor = makeEditor('<p>Hello<br>world</p>');
    expect(editor.getText()).toBe('Hello\nworld');
  });
});
