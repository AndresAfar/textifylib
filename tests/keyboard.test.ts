import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, eventToCombo, normalizeCombo, type Editor } from '../src';

let editors: Editor[] = [];

function makeEditor(content: string): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element, content });
  editors.push(editor);
  return editor;
}

function selectFlat(editor: Editor, from: number, to: number): void {
  const textNode = editor.element.querySelector('p')!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, from);
  range.setEnd(textNode, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

describe('combo normalization', () => {
  it('normalizes Mod and case', () => {
    expect(normalizeCombo('Mod-b')).toBe('mod-b');
    expect(normalizeCombo('Ctrl-Shift-Z')).toBe('mod-shift-z');
    expect(normalizeCombo('CMD-alt-shift-a')).toBe('mod-alt-shift-a');
  });

  it('derives a combo from a keyboard event', () => {
    const event = new KeyboardEvent('keydown', { key: 'B', ctrlKey: true });
    expect(eventToCombo(event)).toBe('mod-b');
  });
});

describe('built-in shortcuts', () => {
  it('applies bold with Mod-b', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);

    editor.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong> world</p>');
  });

  it('applies italic with Mod-i', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);

    editor.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(editor.getHTML()).toBe('<p><em>Hello</em> world</p>');
  });

  it('undoes with Mod-z', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);
    editor.commands.bold();
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong> world</p>');

    editor.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(editor.getHTML()).toBe('<p>Hello world</p>');
  });

  it('redoes with Mod-Shift-z', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFlat(editor, 0, 5);
    editor.commands.bold();
    editor.commands.undo();

    editor.element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(editor.getHTML()).toBe('<p><strong>Hello</strong> world</p>');
  });
});
