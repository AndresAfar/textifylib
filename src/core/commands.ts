import type { Node as EditorNode } from '../model/types';
import { docSize, posOfTextOffset, textOffsetOf } from '../model/position';
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
  selectAll: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  [name: string]: unknown;
}

function toggle(ctx: CommandContext, type: string): boolean {
  const sel = ctx.getSelection();
  if (!sel || sel.from === sel.to) return false;
  const doc = toggleMark(ctx.getDocument(), sel.from, sel.to, { type });
  return ctx.apply(doc, sel.from, sel.to);
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
      return ctx.apply(doc, sel.from, sel.to);
    },

    paragraph: () => {
      const sel = ctx.getSelection();
      if (!sel) return false;
      const doc = setBlockType(ctx.getDocument(), sel.from, sel.to, 'paragraph');
      return ctx.apply(doc, sel.from, sel.to);
    },

    bulletList: () => toggleListCommand(ctx, 'bulletList'),
    orderedList: () => toggleListCommand(ctx, 'orderedList'),

    link: (attrs) => {
      const sel = ctx.getSelection();
      if (!sel || sel.from === sel.to || !attrs?.href) return false;
      const doc = setMark(ctx.getDocument(), sel.from, sel.to, {
        type: 'link',
        attrs: { href: attrs.href },
      });
      return ctx.apply(doc, sel.from, sel.to);
    },

    unlink: () => {
      const sel = ctx.getSelection();
      if (!sel || sel.from === sel.to) return false;
      const doc = removeMark(ctx.getDocument(), sel.from, sel.to, 'link');
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
  const hasTextSelection = (): boolean => {
    const sel = ctx.getSelection();
    return !!sel && sel.from !== sel.to;
  };
  const hasSelection = (): boolean => ctx.getSelection() !== null;

  return {
    bold: hasTextSelection,
    italic: hasTextSelection,
    underline: hasTextSelection,
    strike: hasTextSelection,
    heading: () => hasSelection(),
    paragraph: () => hasSelection(),
    bulletList: () => hasSelection(),
    orderedList: () => hasSelection(),
    link: hasTextSelection,
    unlink: hasTextSelection,
    selectAll: hasSelection,
    undo: () => ctx.canUndo(),
    redo: () => ctx.canRedo(),
  };
}
