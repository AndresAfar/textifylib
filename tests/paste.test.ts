import { afterEach, describe, expect, it } from 'vitest';
import {
  HTMLParser,
  HTMLSerializer,
  Sanitizer,
  createEditor,
  getDefaultSchema,
  insertInline,
  node,
  replaceBlocks,
  text,
  type Editor,
} from '../src';

let editors: Editor[] = [];
const parser = new HTMLParser(getDefaultSchema());
const serializer = new HTMLSerializer(getDefaultSchema());

function makeEditor(content: string): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element, content });
  editors.push(editor);
  return editor;
}

function setCaret(editor: Editor, charOffset: number): void {
  const textNode = editor.element.querySelector('p')!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, charOffset);
  range.collapse(true);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Build a synthetic paste event carrying clipboard data. */
function pasteEvent(html: string, plain: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? html : type === 'text/plain' ? plain : ''),
    },
  });
  return event;
}

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('Sanitizer', () => {
  const sanitizer = new Sanitizer();

  it('removes dangerous elements', () => {
    expect(sanitizer.sanitize('<p>Safe</p><script>alert(1)</script>')).toBe('<p>Safe</p>');
    expect(sanitizer.sanitize('<iframe src="x"></iframe><p>ok</p>')).toBe('<p>ok</p>');
    expect(sanitizer.sanitize('<p>a</p><svg><circle /></svg>')).toBe('<p>a</p>');
  });

  it('removes event handler attributes', () => {
    expect(sanitizer.sanitize('<p onclick="alert(1)">Hi</p>')).toBe('<p>Hi</p>');
  });

  it('removes javascript: and data: URLs', () => {
    expect(sanitizer.sanitize('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizer.sanitize('<img src="data:text/html;base64,PHNjcmlwdD4=" />')).toBe('<img>');
  });

  it('keeps safe URLs', () => {
    expect(sanitizer.sanitize('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
  });
});

describe('paste transforms', () => {
  it('inserts inline text at a caret', () => {
    const doc = parser.parse('<p>Hello world</p>');
    const next = insertInline(doc, 6, 6, [text('X')]);
    expect(serializer.serialize(next)).toBe('<p>HelloX world</p>');
  });

  it('replaces inline text with inline content', () => {
    const doc = parser.parse('<p>Hello world</p>');
    const next = insertInline(doc, 1, 6, [text('Bye')]);
    expect(serializer.serialize(next)).toBe('<p>Bye world</p>');
  });

  it('splits blocks to insert block content', () => {
    const doc = parser.parse('<p>AB</p><p>CD</p>');
    const next = replaceBlocks(doc, 3, 3, [
      node('paragraph', [text('X')]),
      node('paragraph', [text('Y')]),
    ]);
    expect(serializer.serialize(next)).toBe('<p>AB</p><p>X</p><p>Y</p><p>CD</p>');
  });
});

describe('paste event handling', () => {
  it('pastes plain text at the caret', () => {
    const editor = makeEditor('<p>Hello world</p>');
    setCaret(editor, 5);
    editor.element.dispatchEvent(pasteEvent('', 'XYZ'));
    expect(editor.getHTML()).toBe('<p>HelloXYZ world</p>');
  });

  it('pastes inline HTML at the caret', () => {
    const editor = makeEditor('<p>Hello world</p>');
    setCaret(editor, 5);
    editor.element.dispatchEvent(pasteEvent('<strong>X</strong>', ''));
    expect(editor.getHTML()).toBe('<p>Hello<strong>X</strong> world</p>');
  });

  it('pastes multi-paragraph HTML as blocks', () => {
    const editor = makeEditor('<p>AB</p><p>CD</p>');
    setCaret(editor, 2); // end of "AB"
    editor.element.dispatchEvent(pasteEvent('<p>X</p><p>Y</p>', ''));
    expect(editor.getHTML()).toBe('<p>AB</p><p>X</p><p>Y</p><p>CD</p>');
  });

  it('pastes multi-line plain text as paragraphs', () => {
    const editor = makeEditor('<p>AB</p>');
    setCaret(editor, 2);
    editor.element.dispatchEvent(pasteEvent('', 'X\nY'));
    expect(editor.getHTML()).toBe('<p>AB</p><p>X</p><p>Y</p>');
  });

  it('sanitizes pasted HTML', () => {
    const editor = makeEditor('<p>AB</p>');
    setCaret(editor, 2);
    editor.element.dispatchEvent(
      pasteEvent('<p>Safe</p><script>alert(1)</script><a href="javascript:x">bad</a>', ''),
    );
    expect(editor.getHTML()).toBe('<p>AB</p><p>Safe</p><p>bad</p>');
  });

  it('replaces a selection with pasted text', () => {
    const editor = makeEditor('<p>Hello world</p>');
    const textNode = editor.element.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 5);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    editor.element.dispatchEvent(pasteEvent('', 'Bye'));
    expect(editor.getHTML()).toBe('<p>Bye world</p>');
  });

  it('records paste in the undo history', () => {
    const editor = makeEditor('<p>AB</p>');
    setCaret(editor, 2);
    editor.element.dispatchEvent(pasteEvent('', 'X'));
    expect(editor.getHTML()).toBe('<p>ABX</p>');
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>AB</p>');
  });
});
