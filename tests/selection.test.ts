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

describe('getSelection', () => {
  it('returns the flat selection range', () => {
    const editor = makeEditor('<p>Hello</p>');
    selectFlat(editor, 0, 3);
    expect(editor.getSelection()).toEqual({ from: 1, to: 4, empty: false });
  });

  it('reports an empty selection for a caret', () => {
    const editor = makeEditor('<p>Hello</p>');
    setCaret(editor, 2);
    expect(editor.getSelection()).toEqual({ from: 3, to: 3, empty: true });
  });

  it('returns null when there is no selection', () => {
    const editor = makeEditor('<p>Hello</p>');
    window.getSelection()?.removeAllRanges();
    expect(editor.getSelection()).toBeNull();
  });

  it('returns null when the selection is outside the editor', () => {
    const editor = makeEditor('<p>Hello</p>');
    const other = document.createElement('div');
    other.textContent = 'outside';
    document.body.appendChild(other);

    const range = document.createRange();
    range.setStart(other.firstChild!, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    expect(editor.getSelection()).toBeNull();
  });
});

describe('setSelection', () => {
  it('sets the DOM selection from flat positions', () => {
    const editor = makeEditor('<p>Hello world</p>');
    editor.setSelection(1, 6);
    expect(editor.getSelection()).toEqual({ from: 1, to: 6, empty: false });
  });

  it('clamps out-of-range positions', () => {
    const editor = makeEditor('<p>Hello</p>');
    editor.setSelection(-100, 100);
    // Clamped to the whole text content: [1, 6) for a five-character paragraph.
    expect(editor.getSelection()).toEqual({ from: 1, to: 6, empty: false });
  });
});

describe('selectAll', () => {
  it('selects the whole document', () => {
    const editor = makeEditor('<p>Hello</p><p>World</p>');
    expect(editor.commands.selectAll()).toBe(true);

    const sel = editor.getSelection()!;
    expect(sel.empty).toBe(false);
    // First text starts at 1; "World" ends at 13 (7 boundary + 1 + 5).
    expect(sel.from).toBe(1);
    expect(sel.to).toBe(13);
  });
});

describe('getActiveMarks', () => {
  it('returns the marks at the caret', () => {
    const editor = makeEditor('<p><strong>bold</strong> rest</p>');
    setCaret(editor, 2);
    expect(editor.getActiveMarks()).toEqual([{ type: 'bold' }]);
  });

  it('returns marks common to a whole selection', () => {
    const editor = makeEditor('<p><strong>bold and</strong> <em>italic</em></p>');
    selectFlat(editor, 0, 4);
    expect(editor.getActiveMarks()).toEqual([{ type: 'bold' }]);
  });

  it('returns no marks when a selection has no common mark', () => {
    const editor = makeEditor('<p><strong>bold</strong> <em>italic</em></p>');
    selectFlat(editor, 0, 10);
    expect(editor.getActiveMarks()).toEqual([]);
  });
});
