import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEditor, type Editor, type Transaction } from '../src';

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

afterEach(() => {
  vi.useRealTimers();
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('undo / redo', () => {
  it('undoes and redoes a mark command', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);
    editor.commands.bold();
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong> world</p>');

    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe('<p>Hello world</p>');

    expect(editor.commands.redo()).toBe(true);
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong> world</p>');
  });

  it('undoes setHTML', () => {
    const editor = makeEditor('<p>one</p>');
    editor.setHTML('<p>two</p>');
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>one</p>');
    editor.commands.redo();
    expect(editor.getHTML()).toBe('<p>two</p>');
  });

  it('undoes clear', () => {
    const editor = makeEditor('<p>one</p>');
    editor.clear();
    expect(editor.getHTML()).toBe('<p></p>');
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>one</p>');
  });

  it('reports undo/redo availability via can()', () => {
    const editor = makeEditor('<p>Hello world</p>');
    expect(editor.can().undo()).toBe(false);
    expect(editor.can().redo()).toBe(false);

    selectFlat(editor, 0, 5);
    editor.commands.bold();
    expect(editor.can().undo()).toBe(true);
    expect(editor.can().redo()).toBe(false);

    editor.commands.undo();
    expect(editor.can().undo()).toBe(false);
    expect(editor.can().redo()).toBe(true);
  });

  it('truncates the redo branch after a new edit', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);
    editor.commands.bold();
    editor.commands.undo();

    selectFlat(editor, 0, 5);
    editor.commands.italic();
    expect(editor.getHTML()).toBe('<p><em>Hello</em> world</p>');
    expect(editor.can().redo()).toBe(false);
  });
});

describe('input history', () => {
  it('records typed input as an undoable change', () => {
    const editor = makeEditor('<p>hi</p>');
    editor.element.innerHTML = '<p>hia</p>';
    editor.element.dispatchEvent(new Event('input'));

    expect(editor.getHTML()).toBe('<p>hia</p>');
    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>hi</p>');
  });

  it('groups consecutive keystrokes into one undo step', () => {
    vi.useFakeTimers();
    const editor = makeEditor('<p>hi</p>');

    editor.element.innerHTML = '<p>hia</p>';
    editor.element.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(100);

    editor.element.innerHTML = '<p>hiab</p>';
    editor.element.dispatchEvent(new Event('input'));

    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>hi</p>');
  });

  it('breaks the input group after a pause', () => {
    vi.useFakeTimers();
    const editor = makeEditor('<p>hi</p>');

    editor.element.innerHTML = '<p>hia</p>';
    editor.element.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(600);

    editor.element.innerHTML = '<p>hiab</p>';
    editor.element.dispatchEvent(new Event('input'));

    editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>hia</p>');
  });
});

describe('events', () => {
  it('emits update and transaction on a command', () => {
    const editor = makeEditor('<p>Hello world</p>');
    const updates: string[] = [];
    const transactions: Transaction[] = [];

    editor.on('update', ({ editor: current }) => updates.push(current.getHTML()));
    editor.on('transaction', ({ transaction }) => transactions.push(transaction));

    selectFlat(editor, 0, 5);
    editor.commands.bold();

    expect(updates).toEqual(['<p><strong>Hello</strong> world</p>']);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]!.after).toBeDefined();
    expect(transactions[0]!.before).toBeDefined();
  });

  it('emits update on undo', () => {
    const editor = makeEditor('<p>Hello world</p>');
    const updates: string[] = [];
    editor.on('update', ({ editor: current }) => updates.push(current.getHTML()));

    selectFlat(editor, 0, 5);
    editor.commands.bold();
    editor.commands.undo();

    expect(updates).toEqual(['<p><strong>Hello</strong> world</p>', '<p>Hello world</p>']);
  });

  it('off removes a handler', () => {
    const editor = makeEditor('<p>x</p>');
    let count = 0;
    const handler = (): void => {
      count += 1;
    };
    editor.on('update', handler);
    editor.setHTML('<p>y</p>');
    expect(count).toBe(1);

    editor.off('update', handler);
    editor.setHTML('<p>z</p>');
    expect(count).toBe(1);
  });

  it('emits focus and blur', () => {
    const editor = makeEditor('<p>x</p>');
    const events: string[] = [];
    editor.on('focus', () => events.push('focus'));
    editor.on('blur', () => events.push('blur'));

    editor.focus();
    editor.blur();
    expect(events).toEqual(['focus', 'blur']);
  });
});
