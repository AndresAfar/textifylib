import type { Node as EditorNode } from '../model/types';

export interface TransactionSelection {
  from: number;
  to: number;
}

/**
 * A document change, from a `before` state to an `after` state, with the
 * selection to restore after the change.
 *
 * Documents are immutable, so `before` and `after` may safely share sub-trees.
 * A step-based builder (`transaction.insert(...)`, `addMark(...)`, `delete(...)`)
 * will be layered on top in a later milestone.
 */
export interface Transaction {
  before: EditorNode;
  after: EditorNode;
  selection: TransactionSelection | null;
}
