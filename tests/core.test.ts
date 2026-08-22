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

afterEach(() => {
  for (const editor of editors) editor.destroy();
  editors = [];
  document.body.innerHTML = '';
});

describe('createEditor', () => {
  it('creates an editor with an empty document by default', () => {
    const editor = makeEditor();
    expect(editor.getHTML()).toBe('<p></p>');
    expect(editor.getText()).toBe('');
    expect(editor.isEmpty()).toBe(true);
  });

  it('sets contenteditable on the host element', () => {
    const editor = makeEditor();
    expect(editor.element.getAttribute('contenteditable')).toBe('true');
  });

  it('parses the initial content', () => {
    const editor = makeEditor('<p>Hello <strong>world</strong></p>');
    expect(editor.getHTML()).toBe('<p>Hello <strong>world</strong></p>');
    expect(editor.getText()).toBe('Hello world');
  });
});

describe('getHTML / setHTML', () => {
  it('round-trips nested marks', () => {
    const editor = makeEditor();
    editor.setHTML('<p>a <strong>b <em>c</em></strong> d</p>');
    expect(editor.getHTML()).toBe('<p>a <strong>b <em>c</em></strong> d</p>');
  });

  it('normalizes b/i to strong/em', () => {
    const editor = makeEditor('<p><b>bold</b> and <i>italic</i></p>');
    expect(editor.getHTML()).toBe('<p><strong>bold</strong> and <em>italic</em></p>');
  });

  it('unwraps unknown wrappers into paragraphs', () => {
    const editor = makeEditor('<div>Hello <strong>world</strong></div>');
    expect(editor.getHTML()).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('escapes reserved characters', () => {
    const editor = makeEditor('<p>1 &lt; 2 &amp; 3</p>');
    expect(editor.getHTML()).toBe('<p>1 &lt; 2 &amp; 3</p>');
  });
});

describe('getJSON / setJSON', () => {
  it('returns a serializable document model', () => {
    const editor = makeEditor('<p>Hello <strong>world</strong></p>');
    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    });
  });

  it('returns a deep copy, not an internal reference', () => {
    const editor = makeEditor('<p>Hello</p>');
    const json = editor.getJSON();
    json.content![0]!.type = 'paragraph';
    json.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'x' }] });
    expect(editor.getHTML()).toBe('<p>Hello</p>');
  });

  it('sets content from a JSON document', () => {
    const editor = makeEditor();
    editor.setJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }] }],
        },
      ],
    });
    expect(editor.getHTML()).toBe('<p><strong>Hi</strong></p>');
  });

  it('rejects non-document roots', () => {
    const editor = makeEditor();
    expect(() => editor.setJSON({ type: 'paragraph', content: [] })).toThrow();
  });
});

describe('getText', () => {
  it('joins blocks with newlines and ignores markup', () => {
    const editor = makeEditor('<p>Hello <strong>world</strong></p><p>This is TextifyLib.</p>');
    expect(editor.getText()).toBe('Hello world\nThis is TextifyLib.');
  });
});

describe('clear / isEmpty', () => {
  it('clears to an empty paragraph', () => {
    const editor = makeEditor('<p>Hello</p>');
    editor.clear();
    expect(editor.getHTML()).toBe('<p></p>');
    expect(editor.isEmpty()).toBe(true);
  });
});

describe('focus / blur / isFocused', () => {
  it('reflects focus state', () => {
    const editor = makeEditor();
    expect(editor.isFocused()).toBe(false);
    editor.focus();
    expect(editor.isFocused()).toBe(true);
    editor.blur();
    expect(editor.isFocused()).toBe(false);
  });
});

describe('input sync', () => {
  it('updates the model when the DOM changes', () => {
    const editor = makeEditor('<p>Hello</p>');
    editor.element.innerHTML = '<p>Hello <strong>typed</strong></p>';
    editor.element.dispatchEvent(new Event('input'));
    expect(editor.getHTML()).toBe('<p>Hello <strong>typed</strong></p>');
    expect(editor.getText()).toBe('Hello typed');
  });
});

describe('destroy', () => {
  it('is idempotent and stops syncing', () => {
    const editor = makeEditor('<p>Hello</p>');
    editor.destroy();
    expect(() => editor.destroy()).not.toThrow();
  });
});
