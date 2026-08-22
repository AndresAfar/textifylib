import type { Node as EditorNode } from '../model/types';
import type { TransactionSelection } from './Transaction';

export interface HistoryEntry {
  doc: EditorNode;
  selection: TransactionSelection | null;
  /** Entries sharing a non-null group merge (e.g. consecutive keystrokes). */
  group: string | null;
}

/**
 * An undo/redo stack over immutable document states.
 *
 * Each entry stores a document reference (documents are immutable, so no
 * copying is needed) and the selection to restore when that state is reached.
 */
export class History {
  private entries: HistoryEntry[] = [];
  private index = -1;

  constructor(initial: EditorNode) {
    this.entries.push({ doc: initial, selection: null, group: null });
    this.index = 0;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  record(doc: EditorNode, selection: TransactionSelection | null, group: string | null): void {
    const last = this.entries[this.index];

    // Merge consecutive entries of the same group (e.g. a burst of typing).
    if (group !== null && last && last.group === group) {
      this.entries[this.index] = { doc, selection, group };
      return;
    }

    // Truncate any redo branch, then push the new state.
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ doc, selection, group });
    this.index = this.entries.length - 1;
  }

  undo(): HistoryEntry | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.entries[this.index] ?? null;
  }

  redo(): HistoryEntry | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.entries[this.index] ?? null;
  }
}
