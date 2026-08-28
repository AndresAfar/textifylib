import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, FONT_FAMILIES, type Editor } from '../src';

let editors: Editor[] = [];

const UBUNTU_MONO = "'Ubuntu Mono', monospace";
const TIMES_NEW_ROMAN = "'Times New Roman', serif";

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

describe('fontFamily command', () => {
  it('applies a font family to the selection', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);
    expect(editor.commands.fontFamily(UBUNTU_MONO)).toBe(true);
    expect(editor.getHTML()).toBe(
      `<p><span style="font-family: ${UBUNTU_MONO}">Hello</span> world</p>`,
    );
  });

  it('changes an existing font family', () => {
    const editor = makeEditor(
      `<p><span style="font-family: ${UBUNTU_MONO}">Hello</span> world</p>`,
    );
    selectFlat(editor, 0, 5);
    expect(editor.commands.fontFamily(TIMES_NEW_ROMAN)).toBe(true);
    expect(editor.getHTML()).toBe(
      `<p><span style="font-family: ${TIMES_NEW_ROMAN}">Hello</span> world</p>`,
    );
  });

  it('unsets the font family', () => {
    const editor = makeEditor(
      `<p><span style="font-family: ${UBUNTU_MONO}">Hello</span> world</p>`,
    );
    selectFlat(editor, 0, 5);
    expect(editor.commands.unsetFontFamily()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
  });

  it('stores a font family at a collapsed selection instead of applying it', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 1);
    expect(editor.commands.fontFamily(UBUNTU_MONO)).toBe(true);
    expect(editor.getHTML()).toBe('<p>Hello</p>');
    expect(editor.isActive('fontFamily', { fontFamily: UBUNTU_MONO })).toBe(true);
  });

  it('applies a stored font family to subsequently typed text', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 5);
    expect(editor.commands.fontFamily(UBUNTU_MONO)).toBe(true);
    typeText(editor, '!');
    expect(editor.getHTML()).toBe(`<p>Hello<span style="font-family: ${UBUNTU_MONO}">!</span></p>`);
  });

  it('round-trips parsing and serializing a font mark', () => {
    const editor = makeEditor(`<p><span style="font-family: ${UBUNTU_MONO}">Hi</span></p>`);
    expect(editor.getHTML()).toBe(`<p><span style="font-family: ${UBUNTU_MONO}">Hi</span></p>`);
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hi',
              marks: [{ type: 'fontFamily', attrs: { fontFamily: UBUNTU_MONO } }],
            },
          ],
        },
      ],
    });
  });
});

describe('fontFamily isActive', () => {
  it('reports an active font family with attributes', () => {
    const editor = makeEditor(
      `<p><span style="font-family: ${UBUNTU_MONO}">Hello</span> world</p>`,
    );
    selectFlat(editor, 0, 5);
    expect(editor.isActive('fontFamily')).toBe(true);
    expect(editor.isActive('fontFamily', { fontFamily: UBUNTU_MONO })).toBe(true);
    expect(editor.isActive('fontFamily', { fontFamily: TIMES_NEW_ROMAN })).toBe(false);
  });
});

describe('FONT_FAMILIES', () => {
  it('includes the requested curated fonts', () => {
    const values = FONT_FAMILIES.map((font) => font.value);
    expect(values).toContain(UBUNTU_MONO);
    expect(values).toContain(TIMES_NEW_ROMAN);
    expect(values).toContain('Inconsolata, monospace');
  });

  it('provides a generic fallback for every font', () => {
    for (const font of FONT_FAMILIES) {
      expect(font.value).toMatch(/,\s*(sans-serif|serif|monospace|cursive)$/);
    }
  });
});
