import { describe, expect, it } from 'vitest';
import { HTMLParser, HTMLSerializer, getDefaultSchema } from '../src';
import { node, text } from '../src';

const parser = new HTMLParser(getDefaultSchema());
const serializer = new HTMLSerializer(getDefaultSchema());

describe('HTMLParser', () => {
  it('parses a single paragraph', () => {
    expect(parser.parse('<p>Hello</p>')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('parses nested marks', () => {
    expect(parser.parse('<p><strong>a <em>b</em></strong></p>')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'a ',
              marks: [{ type: 'bold' }],
            },
            {
              type: 'text',
              text: 'b',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    });
  });

  it('wraps bare text in a paragraph', () => {
    expect(parser.parse('Hello')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('produces an empty paragraph for empty input', () => {
    expect(parser.parse('')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    });
  });

  it('drops dangerous elements', () => {
    const doc = parser.parse('<p>Safe</p><script>alert(1)</script><iframe src="x"></iframe>');
    expect(doc).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Safe' }] }],
    });
  });

  it('unwraps unknown inline elements', () => {
    expect(parser.parse('<p>a <span>b</span> c</p>')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a ' },
            { type: 'text', text: 'b' },
            { type: 'text', text: ' c' },
          ],
        },
      ],
    });
  });

  it('parses headings with their level', () => {
    expect(parser.parse('<h3>Title</h3>')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Title' }] },
      ],
    });
  });

  it('parses underline and strike marks', () => {
    expect(parser.parse('<p><u>u</u><s>s</s></p>')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'u', marks: [{ type: 'underline' }] },
            { type: 'text', text: 's', marks: [{ type: 'strike' }] },
          ],
        },
      ],
    });
  });

  it('parses links with href and drops href-less anchors', () => {
    expect(parser.parse('<p><a href="https://x.example">x</a><a>y</a></p>')).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'https://x.example' } }],
            },
            { type: 'text', text: 'y' },
          ],
        },
      ],
    });
  });
});

describe('HTMLSerializer', () => {
  it('serializes a document', () => {
    const doc = node('doc', [
      node('paragraph', [text('Hello '), text('world', [{ type: 'bold' }])]),
    ]);
    expect(serializer.serialize(doc)).toBe('<p>Hello <strong>world</strong></p>');
  });

  it('serializes combined marks outermost-first', () => {
    const doc = node('doc', [
      node('paragraph', [text('x', [{ type: 'bold' }, { type: 'italic' }])]),
    ]);
    expect(serializer.serialize(doc)).toBe('<p><strong><em>x</em></strong></p>');
  });

  it('escapes text content', () => {
    const doc = node('doc', [node('paragraph', [text('a < b & "c"')])]);
    expect(serializer.serialize(doc)).toBe('<p>a &lt; b &amp; "c"</p>');
  });

  it('serializes an empty document', () => {
    expect(serializer.serialize(node('doc', []))).toBe('');
  });

  it('serializes headings and links', () => {
    const doc = node('doc', [
      node('heading', [text('Hi', [{ type: 'link', attrs: { href: 'https://x.example' } }])], {
        level: 2,
      }),
    ]);
    expect(serializer.serialize(doc)).toBe('<h2><a href="https://x.example">Hi</a></h2>');
  });
});
