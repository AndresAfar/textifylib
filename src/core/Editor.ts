import type { Mark, Node as EditorNode } from '../model/types';
import { node } from '../model/types';
import {
  blocksInSelection,
  commonMarks,
  docSize,
  marksAt,
  marksEqual,
  rangeHasMark,
  rangeHasMarkType,
} from '../model/position';
import { Schema, builtinMarks, builtinNodes } from '../schema';
import { DOMRenderer } from '../dom/DOMRenderer';
import { HTMLParser } from '../serialization/HTMLParser';
import { HTMLSerializer } from '../serialization/HTMLSerializer';
import { getPlainText } from '../serialization/TextSerializer';
import { attrsEqual, cloneNode } from '../utils';
import { buildDOMIndex, domPointToPosition, modelToDomPoint } from '../selection';
import type { EditorSelection } from '../selection';
import { EventEmitter } from '../events/EventEmitter';
import { Keyboard } from '../input/Keyboard';
import { Paste } from '../input/Paste';
import { Sanitizer } from '../dom/Sanitizer';
import { ExtensionManager } from '../extensions/ExtensionManager';
import type { Extension } from '../extensions/Extension';
import { History } from './History';
import type { Transaction } from './Transaction';
import {
  createCanCommands,
  createCommands,
  type CanCommands,
  type CommandContext,
  type EditorCommands,
  type SelectionRange,
} from './commands';

const INPUT_GROUP_MS = 500;

/** Default keyboard shortcuts, keyed by normalized combo string. */
const DEFAULT_SHORTCUTS: Record<string, string> = {
  'Mod-b': 'bold',
  'Mod-i': 'italic',
  'Mod-u': 'underline',
  'Mod-z': 'undo',
  'Mod-Shift-z': 'redo',
};

export interface EditorOptions {
  /** The DOM element that will host the editable surface. */
  element: HTMLElement;
  /** Initial content as an HTML string. */
  content?: string;
  /** Whether the editor is editable. Defaults to `true`. */
  editable?: boolean;
  /** Placeholder text shown while the editor is empty. */
  placeholder?: string;
  /** Extensions to load (nodes, marks, commands, shortcuts, event handlers). */
  extensions?: Extension[];
}

export interface EditorEvents {
  update: { editor: Editor };
  transaction: { editor: Editor; transaction: Transaction };
  selectionUpdate: { editor: Editor; selection: EditorSelection | null };
  focus: { editor: Editor };
  blur: { editor: Editor };
}

/**
 * A headless rich text editor instance.
 *
 * The editor owns a document model (the source of truth) and a DOM renderer
 * that projects that model into a `contenteditable` element. All document
 * changes flow through a single `dispatch` path that records a transaction in
 * the undo/redo history and emits events.
 */
export class Editor {
  readonly element: HTMLElement;
  readonly commands: EditorCommands;

  private readonly schema: Schema;
  private readonly parser: HTMLParser;
  private readonly serializer: HTMLSerializer;
  private readonly renderer: DOMRenderer;
  private readonly canCommands: CanCommands;
  private readonly history: History;
  private readonly keyboard: Keyboard;
  private readonly sanitizer = new Sanitizer();
  private readonly paste: Paste;
  private readonly events = new EventEmitter<EditorEvents>();

  private doc: EditorNode;
  private composing = false;
  private destroyed = false;
  private lastInputTime = 0;
  private inputGroup: string | null = null;

  private readonly handleInput = (): void => {
    if (this.composing) return;
    this.syncInput();
  };

  private readonly handleCompositionStart = (): void => {
    this.composing = true;
  };

  private readonly handleCompositionEnd = (): void => {
    this.composing = false;
    this.syncInput();
  };

  private readonly handleFocus = (): void => {
    this.events.emit('focus', { editor: this });
  };

  private readonly handleBlur = (): void => {
    this.events.emit('blur', { editor: this });
  };

  private readonly handleSelectionChange = (): void => {
    this.events.emit('selectionUpdate', { editor: this, selection: this.getSelection() });
  };

  private readonly handlePaste = (event: ClipboardEvent): void => {
    event.preventDefault();
    const data = event.clipboardData;
    if (!data) return;

    this.syncFromDOM();
    const selection = this.readSelectionRange(this.doc);
    if (!selection) return;

    const result = this.paste.createResult(data, this.doc, selection);
    if (!result) return;

    this.dispatch(result.doc, result.selection, { render: true, group: null });
  };

  constructor(options: EditorOptions) {
    this.element = options.element;

    const manager = new ExtensionManager(options.extensions ?? []);
    this.schema = new Schema(
      [...builtinNodes, ...manager.nodes],
      [...builtinMarks, ...manager.marks],
    );
    this.parser = new HTMLParser(this.schema);
    this.serializer = new HTMLSerializer(this.schema);
    this.renderer = new DOMRenderer(this.schema);

    this.doc = options.content != null ? this.parser.parse(options.content) : createEmptyDoc();
    this.history = new History(this.doc);

    const ctx: CommandContext = {
      getDocument: () => this.doc,
      getSelection: () => this.readSelection(),
      apply: (document, from, to) => this.apply(document, from, to),
      setSelection: (from, to) => this.setSelection(from, to),
      undo: () => this.undo(),
      redo: () => this.redo(),
      canUndo: () => this.history.canUndo,
      canRedo: () => this.history.canRedo,
    };

    const extensionCommands: Record<string, unknown> = {};
    for (const [name, command] of Object.entries(manager.commands)) {
      extensionCommands[name] = () => command(ctx);
    }
    this.commands = Object.assign(createCommands(ctx), extensionCommands);
    this.canCommands = createCanCommands(ctx);

    this.keyboard = new Keyboard((name) => this.runCommand(name));
    this.keyboard.addShortcuts(DEFAULT_SHORTCUTS);
    this.keyboard.addShortcuts(manager.shortcuts);
    this.keyboard.bind(this.element);
    this.paste = new Paste(this.parser, this.sanitizer);

    if (manager.eventHandlers.update) this.events.on('update', manager.eventHandlers.update);
    if (manager.eventHandlers.transaction)
      this.events.on('transaction', manager.eventHandlers.transaction);
    if (manager.eventHandlers.selectionUpdate)
      this.events.on('selectionUpdate', manager.eventHandlers.selectionUpdate);
    if (manager.eventHandlers.focus) this.events.on('focus', manager.eventHandlers.focus);
    if (manager.eventHandlers.blur) this.events.on('blur', manager.eventHandlers.blur);

    this.element.setAttribute('contenteditable', String(options.editable ?? true));
    if (options.placeholder) {
      this.element.setAttribute('data-placeholder', options.placeholder);
    }

    this.renderer.render(this.element, this.doc);

    this.element.addEventListener('input', this.handleInput);
    this.element.addEventListener('compositionstart', this.handleCompositionStart);
    this.element.addEventListener('compositionend', this.handleCompositionEnd);
    this.element.addEventListener('focus', this.handleFocus);
    this.element.addEventListener('blur', this.handleBlur);
    this.element.addEventListener('paste', this.handlePaste);
    document.addEventListener('selectionchange', this.handleSelectionChange);
  }

  /** Subscribe to an editor event. */
  on<K extends keyof EditorEvents>(event: K, handler: (payload: EditorEvents[K]) => void): void {
    this.events.on(event, handler);
  }

  /** Unsubscribe from an editor event. */
  off<K extends keyof EditorEvents>(event: K, handler: (payload: EditorEvents[K]) => void): void {
    this.events.off(event, handler);
  }

  /** Serialize the current document to a clean HTML string. */
  getHTML(): string {
    return this.serializer.serialize(this.doc);
  }

  /** Return the current document as a JSON-serializable tree (a deep copy). */
  getJSON(): EditorNode {
    return cloneNode(this.doc);
  }

  /** Return the plain text content of the document. */
  getText(): string {
    return getPlainText(this.doc);
  }

  /** Replace the document by parsing an HTML string. */
  setHTML(html: string): void {
    this.dispatch(this.parser.parse(html), null, { render: true, group: null });
  }

  /** Replace the document with a JSON tree. */
  setJSON(json: EditorNode): void {
    if (!json || json.type !== 'doc') {
      throw new Error('setJSON expects a document node of type "doc".');
    }
    this.dispatch(cloneNode(json), null, { render: true, group: null });
  }

  /** Clear the editor, leaving a single empty paragraph. */
  clear(): void {
    this.dispatch(createEmptyDoc(), null, { render: true, group: null });
  }

  /** Focus the editable surface. */
  focus(): void {
    this.element.focus();
  }

  /** Blur the editable surface. */
  blur(): void {
    this.element.blur();
  }

  /** Detach all listeners and release the editor. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.element.removeEventListener('input', this.handleInput);
    this.element.removeEventListener('compositionstart', this.handleCompositionStart);
    this.element.removeEventListener('compositionend', this.handleCompositionEnd);
    this.element.removeEventListener('focus', this.handleFocus);
    this.element.removeEventListener('blur', this.handleBlur);
    this.element.removeEventListener('paste', this.handlePaste);
    document.removeEventListener('selectionchange', this.handleSelectionChange);
    this.keyboard.unbind(this.element);
  }

  /** Whether the editable surface currently has focus. */
  isFocused(): boolean {
    return typeof document !== 'undefined' && document.activeElement === this.element;
  }

  /** Whether the document contains no text content. */
  isEmpty(): boolean {
    return this.getText().trim().length === 0;
  }

  /** Query which commands are currently applicable. */
  can(): CanCommands {
    return this.canCommands;
  }

  /**
   * Whether a mark or node type is active at the current selection.
   *
   * For marks, `attrs` may be provided to also require matching attributes
   * (e.g. `isActive('link', { href })`).
   */
  isActive(type: string, attrs?: Record<string, unknown>): boolean {
    const sel = this.readSelection();
    if (!sel) return false;

    if (this.schema.marks.has(type)) {
      return this.isMarkActive(type, attrs, sel);
    }
    if (this.schema.nodes.has(type)) {
      return this.isNodeActive(type, attrs, sel);
    }
    return false;
  }

  /**
   * The current selection as flat model positions, or `null` when there is no
   * selection within the editor.
   */
  getSelection(): EditorSelection | null {
    const sel = this.readSelection();
    if (!sel) return null;
    return { from: sel.from, to: sel.to, empty: sel.from === sel.to };
  }

  /** Set the selection from flat model positions (clamped to the document). */
  setSelection(from: number, to: number): void {
    this.syncFromDOM();
    const size = docSize(this.doc);
    const safeFrom = Math.max(0, Math.min(from, size));
    const safeTo = Math.max(0, Math.min(to, size));
    this.restoreSelection(safeFrom, safeTo);
  }

  /** The marks active at the caret, or common to the whole selection. */
  getActiveMarks(): Mark[] {
    const sel = this.readSelection();
    if (!sel) return [];
    if (sel.from === sel.to) return marksAt(this.doc, sel.from);
    return commonMarks(this.doc, sel.from, sel.to);
  }

  private isMarkActive(
    type: string,
    attrs: Record<string, unknown> | undefined,
    sel: SelectionRange,
  ): boolean {
    if (sel.from === sel.to) {
      return marksAt(this.doc, sel.from).some((m) =>
        attrs ? marksEqual(m, { type, attrs }) : m.type === type,
      );
    }
    if (attrs) return rangeHasMark(this.doc, sel.from, sel.to, { type, attrs });
    return rangeHasMarkType(this.doc, sel.from, sel.to, type);
  }

  private isNodeActive(
    type: string,
    attrs: Record<string, unknown> | undefined,
    sel: SelectionRange,
  ): boolean {
    const blocks = blocksInSelection(this.doc, sel.from, sel.to);
    if (blocks.length === 0) return false;
    return blocks.every((b) => b.node.type === type && (!attrs || attrsEqual(b.node.attrs, attrs)));
  }

  private readSelection(): SelectionRange | null {
    this.syncFromDOM();
    return this.readSelectionRange(this.doc);
  }

  private readSelectionRange(doc: EditorNode): SelectionRange | null {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    if (
      !this.element.contains(range.startContainer) ||
      !this.element.contains(range.endContainer)
    ) {
      return null;
    }

    const index = buildDOMIndex(this.schema, doc, this.element);
    const start = domPointToPosition(index, range.startContainer, range.startOffset);
    const end = domPointToPosition(index, range.endContainer, range.endOffset);
    return { from: Math.min(start, end), to: Math.max(start, end) };
  }

  private apply(document: EditorNode, from: number, to: number): boolean {
    return this.dispatch(document, { from, to }, { render: true, group: null });
  }

  private runCommand(name: string): boolean {
    const command = this.commands[name];
    if (typeof command === 'function') return (command as () => boolean)();
    return false;
  }

  private dispatch(
    after: EditorNode,
    selection: SelectionRange | null,
    options: { render: boolean; group: string | null },
  ): boolean {
    if (this.serializer.serialize(after) === this.serializer.serialize(this.doc)) {
      return false;
    }

    const transaction: Transaction = { before: this.doc, after, selection };
    this.doc = after;

    if (options.render) {
      this.renderer.render(this.element, this.doc);
      if (selection) this.restoreSelection(selection.from, selection.to);
    }

    this.history.record(after, selection, options.group);
    this.events.emit('transaction', { editor: this, transaction });
    this.events.emit('update', { editor: this });
    return true;
  }

  private undo(): boolean {
    const entry = this.history.undo();
    if (!entry) return false;
    this.restoreState(entry.doc, entry.selection);
    return true;
  }

  private redo(): boolean {
    const entry = this.history.redo();
    if (!entry) return false;
    this.restoreState(entry.doc, entry.selection);
    return true;
  }

  private restoreState(doc: EditorNode, selection: SelectionRange | null): void {
    this.doc = doc;
    this.renderer.render(this.element, this.doc);
    if (selection) this.restoreSelection(selection.from, selection.to);
    this.events.emit('update', { editor: this });
  }

  private syncInput(): void {
    const nextDoc = this.parser.parse(this.element.innerHTML);
    if (this.serializer.serialize(nextDoc) === this.serializer.serialize(this.doc)) {
      return;
    }

    const now = Date.now();
    if (this.inputGroup === null || now - this.lastInputTime >= INPUT_GROUP_MS) {
      this.inputGroup = `input-${now}`;
    }
    this.lastInputTime = now;

    const selection = this.readSelectionRange(nextDoc);
    this.dispatch(nextDoc, selection, { render: false, group: this.inputGroup });
  }

  private restoreSelection(from: number, to: number): void {
    const start = modelToDomPoint(this.element, this.doc, this.schema, from);
    const end = modelToDomPoint(this.element, this.doc, this.schema, to);

    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  private syncFromDOM(): void {
    this.doc = this.parser.parse(this.element.innerHTML);
  }
}

function createEmptyDoc(): EditorNode {
  return node('doc', [node('paragraph', [])]);
}

/**
 * Create a new editor instance bound to the given element.
 */
export function createEditor(options: EditorOptions): Editor {
  return new Editor(options);
}
