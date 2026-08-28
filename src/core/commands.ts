import type { Mark, Node as EditorNode } from '../model/types';
import { docSize, marksEqual, posOfTextOffset, textOffsetOf } from '../model/position';
import { removeMark, setBlockType, setMark, toggleList, toggleMark } from '../model/transforms';

export interface SelectionRange {
  from: number;
  to: number;
}

/**
 * Minimal surface the command implementations need from the editor. Kept as an
 * interface so the command layer stays decoupled from the concrete Editor class.
 */
export interface CommandContext {
  getDocument(): EditorNode;
  getSelection(): SelectionRange | null;
  apply(document: EditorNode, from: number, to: number): boolean;
  setSelection(from: number, to: number): void;
  getStoredMarks(): Mark[];
  setStoredMarks(marks: Mark[]): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface EditorCommands {
  bold: () => boolean;
  italic: () => boolean;
  underline: () => boolean;
  strike: () => boolean;
  heading: (level: number) => boolean;
  paragraph: () => boolean;
  bulletList: () => boolean;
  orderedList: () => boolean;
  link: (attrs: { href: string }) => boolean;
  unlink: () => boolean;
  fontFamily: (fontFamily: string) => boolean;
  unsetFontFamily: () => boolean;
  selectAll: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  /** Extension-provided commands are accessible dynamically. */
  [name: string]: unknown;
}

export interface CanCommands {
  bold: () => boolean;
  italic: () => boolean;
  underline: () => boolean;
  strike: () => boolean;
  heading: (level: number) => boolean;
  paragraph: () => boolean;
  bulletList: () => boolean;
  orderedList: () => boolean;
  link: () => boolean;
  unlink: () => boolean;
  fontFamily: () => boolean;
  unsetFontFamily: () => boolean;
  selectAll: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  [name: string]: unknown;
}

function toggle(ctx: CommandContext, type: string): boolean {
  const sel = ctx.getSelection();
  if (!sel) return false;
  if (sel.from === sel.to) return toggleStored(ctx, { type });
  ctx.setStoredMarks([]);
  const doc = toggleMark(ctx.getDocument(), sel.from, sel.to, { type });
  return ctx.apply(doc, sel.from, sel.to);
}

function toggleStored(ctx: CommandContext, mark: Mark): boolean {
  const marks = ctx.getStoredMarks();
  const present = marks.some((m) => marksEqual(m, mark));
  ctx.setStoredMarks(present ? marks.filter((m) => !marksEqual(m, mark)) : [...marks, mark]);
  return true;
}

function setStored(ctx: CommandContext, mark: Mark): boolean {
  ctx.setStoredMarks([...ctx.getStoredMarks().filter((m) => m.type !== mark.type), mark]);
  return true;
}

function removeStored(ctx: CommandContext, type: string): boolean {
  ctx.setStoredMarks(ctx.getStoredMarks().filter((m) => m.type !== type));
  return true;
}

function toggleListCommand(ctx: CommandContext, listType: 'bulletList' | 'orderedList'): boolean {
  const sel = ctx.getSelection();
  if (!sel) return false;

  const before = ctx.getDocument();
  const after = toggleList(before, sel.from, sel.to, listType);
  if (after === before) return false;

  // Structural transforms shift flat positions; map the selection through the
  // text it covered (text is preserved across the transform).
  const from = posOfTextOffset(after, textOffsetOf(before, sel.from));
  const to = posOfTextOffset(after, textOffsetOf(before, sel.to));
  ctx.setStoredMarks([]);
  return ctx.apply(after, from, to);
}

export function createCommands(ctx: CommandContext): EditorCommands {
  return {
    bold: () => toggle(ctx, 'bold'),
    italic: () => toggle(ctx, 'italic'),
    underline: () => toggle(ctx, 'underline'),
    strike: () => toggle(ctx, 'strike'),

    heading: (level) => {
      const sel = ctx.getSelection();
      if (!sel) return false;
      const safeLevel = Math.max(1, Math.min(6, Math.round(level)));
      const doc = setBlockType(ctx.getDocument(), sel.from, sel.to, 'heading', {
        level: safeLevel,
      });
      ctx.setStoredMarks([]);
      return ctx.apply(doc, sel.from, sel.to);
    },

    paragraph: () => {
      const sel = ctx.getSelection();
      if (!sel) return false;
      const doc = setBlockType(ctx.getDocument(), sel.from, sel.to, 'paragraph');
      ctx.setStoredMarks([]);
      return ctx.apply(doc, sel.from, sel.to);
    },

    bulletList: () => toggleListCommand(ctx, 'bulletList'),
    orderedList: () => toggleListCommand(ctx, 'orderedList'),

    link: (attrs) => {
      const sel = ctx.getSelection();
      if (!sel || !attrs?.href) return false;
      const mark: Mark = { type: 'link', attrs: { href: attrs.href } };
      if (sel.from === sel.to) return setStored(ctx, mark);
      ctx.setStoredMarks([]);
      const doc = setMark(ctx.getDocument(), sel.from, sel.to, mark);
      return ctx.apply(doc, sel.from, sel.to);
    },

    unlink: () => {
      const sel = ctx.getSelection();
      if (!sel) return false;
      if (sel.from === sel.to) return removeStored(ctx, 'link');
      ctx.setStoredMarks([]);
      const doc = removeMark(ctx.getDocument(), sel.from, sel.to, 'link');
      return ctx.apply(doc, sel.from, sel.to);
    },

    fontFamily: (fontFamily) => {
      const sel = ctx.getSelection();
      if (!sel || !fontFamily) return false;
      const mark: Mark = { type: 'fontFamily', attrs: { fontFamily } };
      if (sel.from === sel.to) return setStored(ctx, mark);
      ctx.setStoredMarks([]);
      const doc = setMark(ctx.getDocument(), sel.from, sel.to, mark);
      return ctx.apply(doc, sel.from, sel.to);
    },

    unsetFontFamily: () => {
      const sel = ctx.getSelection();
      if (!sel) return false;
      if (sel.from === sel.to) return removeStored(ctx, 'fontFamily');
      ctx.setStoredMarks([]);
      const doc = removeMark(ctx.getDocument(), sel.from, sel.to, 'fontFamily');
      return ctx.apply(doc, sel.from, sel.to);
    },

    selectAll: () => {
      ctx.setSelection(0, docSize(ctx.getDocument()));
      return true;
    },

    undo: () => ctx.undo(),
    redo: () => ctx.redo(),
  };
}

export function createCanCommands(ctx: CommandContext): CanCommands {
  const hasSelection = (): boolean => ctx.getSelection() !== null;

  return {
    bold: hasSelection,
    italic: hasSelection,
    underline: hasSelection,
    strike: hasSelection,
    heading: () => hasSelection(),
    paragraph: () => hasSelection(),
    bulletList: () => hasSelection(),
    orderedList: () => hasSelection(),
    link: hasSelection,
    unlink: hasSelection,
    fontFamily: hasSelection,
    unsetFontFamily: hasSelection,
    selectAll: hasSelection,
    undo: () => ctx.canUndo(),
    redo: () => ctx.canRedo(),
  };
}
