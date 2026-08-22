import { describe, expect, it } from 'vitest';
import {
  HTMLParser,
  HTMLSerializer,
  getDefaultSchema,
  insertInline,
  node,
  replaceBlocks,
  setMark,
  text,
} from '../src';

const parser = new HTMLParser(getDefaultSchema());
const serializer = new HTMLSerializer(getDefaultSchema());

function serialize(doc: ReturnType<typeof parser.parse>): string {
  return serializer.serialize(doc);
}

describe('insertInline edge cases', () => {
  it('inserts at the start of a paragraph', () => {
    const doc = parser.parse('<p>Hello</p>');
    expect(serialize(insertInline(doc, 1, 1, [text('X')]))).toBe('<p>XHello</p>');
  });

  it('inserts at the end of a paragraph', () => {
    const doc = parser.parse('<p>Hello</p>');
    expect(serialize(insertInline(doc, 6, 6, [text('X')]))).toBe('<p>HelloX</p>');
  });

  it('inserts between adjacent inline nodes', () => {
    const doc = parser.parse('<p>a<strong>b</strong>c</p>');
    expect(serialize(insertInline(doc, 2, 2, [text('X')]))).toBe('<p>aX<strong>b</strong>c</p>');
  });

  it('replaces a single node when the rest are outside the range', () => {
    const doc = parser.parse('<p>a<strong>b</strong>c</p>');
    expect(serialize(insertInline(doc, 1, 2, [text('X')]))).toBe('<p>X<strong>b</strong>c</p>');
  });

  it('replaces a trailing node, keeping earlier nodes', () => {
    const doc = parser.parse('<p>a<strong>b</strong>c</p>');
    expect(serialize(insertInline(doc, 3, 4, [text('X')]))).toBe('<p>a<strong>b</strong>X</p>');
  });

  it('is a no-op for empty inline content', () => {
    const doc = parser.parse('<p>Hello</p>');
    expect(insertInline(doc, 1, 1, [])).toBe(doc);
  });

  it('is a no-op when targeting a list', () => {
    const doc = parser.parse('<ul><li>One</li></ul>');
    expect(insertInline(doc, 2, 2, [text('X')])).toBe(doc);
  });
});

describe('replaceBlocks edge cases', () => {
  it('splits a block in the middle of its text', () => {
    const doc = parser.parse('<p>ABCD</p>');
    const next = replaceBlocks(doc, 3, 3, [node('paragraph', [text('X')])]);
    expect(serialize(next)).toBe('<p>AB</p><p>X</p><p>CD</p>');
  });

  it('is a no-op for empty blocks', () => {
    const doc = parser.parse('<p>Hello</p>');
    expect(replaceBlocks(doc, 1, 1, [])).toBe(doc);
  });

  it('replaces a whole block selection spanning multiple blocks', () => {
    const doc = parser.parse('<p>One</p><p>Two</p><p>Three</p>');
    // Select all of "One" and "Two": from=1 to end of "Two" (block boundaries).
    const next = replaceBlocks(doc, 1, 11, [node('paragraph', [text('X')])]);
    expect(serialize(next)).toBe('<p>X</p><p>Three</p>');
  });

  it('inserts blocks at the very end of the document', () => {
    const doc = parser.parse('<p>AB</p>');
    const next = replaceBlocks(doc, 4, 4, [node('paragraph', [text('X')])]);
    expect(serialize(next)).toBe('<p>AB</p><p>X</p>');
  });

  it('replaces a list atomically with pasted blocks', () => {
    const doc = parser.parse('<ul><li>One</li></ul>');
    const next = replaceBlocks(doc, 2, 2, [node('paragraph', [text('X')])]);
    expect(serialize(next)).toBe('<p>X</p>');
  });
});

describe('mark transforms with attributes', () => {
  it('setMark replaces an existing mark of the same type', () => {
    const doc = parser.parse('<p><a href="https://a.example">link</a></p>');
    const next = setMark(doc, 1, 5, { type: 'link', attrs: { href: 'https://b.example' } });
    expect(serialize(next)).toBe('<p><a href="https://b.example">link</a></p>');
  });
});
