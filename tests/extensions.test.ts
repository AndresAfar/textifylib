import { afterEach, describe, expect, it } from 'vitest';
import { createEditor, toggleMark, type Editor, type Extension } from '../src';

let editors: Editor[] = [];

function makeEditor(content: string, extensions?: Extension[]): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element, content, extensions });
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

function runCommand(editor: Editor, name: string): boolean {
  return (editor.commands[name] as () => boolean)();
}

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

const highlightExtension: Extension = {
  name: 'highlight',
  marks: [{ name: 'highlight', parseDOM: [{ tag: 'mark' }], toDOM: () => ['mark', {}, 0] }],
  commands: {
    toggleHighlight: (ctx) => {
      const sel = ctx.getSelection();
      if (!sel || sel.from === sel.to) return false;
      const doc = toggleMark(ctx.getDocument(), sel.from, sel.to, { type: 'highlight' });
      return ctx.apply(doc, sel.from, sel.to);
    },
  },
};

const codeBlockExtension: Extension = {
  name: 'codeBlock',
  nodes: [
    {
      name: 'codeBlock',
      group: 'block',
      content: 'inline*',
      getAttrs: (element) => (element.tagName.toLowerCase() === 'pre' ? {} : false),
      toDOM: () => ['pre', {}, 0],
    },
  ],
};

describe('custom marks and commands', () => {
  it('registers a custom mark and toggles it via a custom command', () => {
    const editor = makeEditor('<p>Hello world</p>', [highlightExtension]);
    selectFlat(editor, 0, 5);
    expect(runCommand(editor, 'toggleHighlight')).toBe(true);
    expect(editor.getHTML()).toBe('<p><mark>Hello</mark> world</p>');
  });

  it('parses and serializes a custom mark', () => {
    const editor = makeEditor('<p><mark>Hi</mark></p>', [highlightExtension]);
    expect(editor.getHTML()).toBe('<p><mark>Hi</mark></p>');
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hi', marks: [{ type: 'highlight' }] }],
        },
      ],
    });
  });
});

describe('custom nodes', () => {
  it('registers a custom node and round-trips it', () => {
    const editor = makeEditor('<pre>const x = 1;</pre>', [codeBlockExtension]);
    expect(editor.getHTML()).toBe('<pre>const x = 1;</pre>');
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] }],
    });
  });
});

describe('custom shortcuts', () => {
  it('registers an extension shortcut', () => {
    const editor = makeEditor('<p>Hello world</p>', [
      { name: 'shortcuts', shortcuts: { 'Mod-Shift-x': 'strike' } },
    ]);
    selectFlat(editor, 0, 5);

    const event = new KeyboardEvent('keydown', {
      key: 'x',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    editor.element.dispatchEvent(event);

    expect(editor.getHTML()).toBe('<p><s>Hello</s> world</p>');
  });
});

describe('event handlers', () => {
  it('registers an extension event handler', () => {
    let updates = 0;
    const editor = makeEditor('<p>one</p>', [
      {
        name: 'logger',
        eventHandlers: { update: () => (updates += 1) },
      },
    ]);

    editor.setHTML('<p>two</p>');
    expect(updates).toBe(1);
  });
});
