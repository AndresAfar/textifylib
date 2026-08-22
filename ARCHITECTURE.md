# TextifyLib Architecture

This document records the important architectural decisions behind TextifyLib,
and the rationale for each.

## Overview

TextifyLib is a headless rich text editor engine. It owns the editor's _logic_ —
a document model, parsing/serialization, selection, commands, transactions,
history, extensions — and leaves the UI entirely to the consumer.

```text
┌─────────────────────────────┐
│          Your UI            │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│        TextifyLib Core       │
│  Editor / Schema / Commands  │
│  Transactions / History      │
│  Selection / Parser / Render │
└──────────────┬──────────────┘
               ▼
       contenteditable DOM
```

## Guiding principles

1. **The document model is the single source of truth.** The DOM is a projection
   of the model, never the other way around.
2. **Pure transforms.** Every document change is produced by a pure function that
   returns a new (immutable) document. Documents are shared by reference across
   history entries safely because nothing mutates them.
3. **Small, single-responsibility modules.** `model/`, `schema/`,
   `serialization/`, `dom/`, `selection/`, `core/`, `input/`, `extensions/`.
4. **No UI, no framework, no required CSS.** Everything is driven imperatively.

## Document model

A document is a tree of `Node`s (`{ type, attrs?, content?, text?, marks? }`).

- Container nodes hold a `content` array; text nodes hold `text`.
- Inline nodes (text) may carry `marks` (`{ type, attrs? }`).
- The model is JSON-serializable and independent of the DOM.

Example:

```json
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Hello " },
        { "type": "text", "text": "world", "marks": [{ "type": "bold" }] }
      ]
    }
  ]
}
```

## Schema

The `Schema` registers `NodeSpec`s and `MarkSpec`s. Each spec declares its name,
group, content model, and how it maps to/from the DOM (`toDOM`, `getAttrs`,
`parse`). The schema is what makes nodes/marks extensible: extensions register
new specs, and the parser, serializer and selection layer all consult it.

Content models are declared with a small expression language:
`inline*`, `block*`, `listItem+`, ... A leading `inline` marks the node as
holding inline content (paragraphs, headings, list items); everything else is
treated as block content (doc, lists).

## Positions

Positions are flat integer offsets over the document (ProseMirror-style):

- A text node occupies `text.length` positions.
- A non-text leaf occupies `1`.
- A container occupies `2 + content.size` (one for its opening boundary, one for
  its closing).

This uniform model makes range operations (marks, blocks, paste) composable, and
is the foundation for future transactions, plugins and collaboration.

Two helpers bridge structure and text when transforms restructure the document
(list wrap/lift, paste):

- `textOffsetOf(doc, pos)` — characters strictly before a flat position.
- `posOfTextOffset(doc, offset)` — the flat position at a character offset.

Because structural transforms preserve text, these map a selection across a
restructure without a full step system.

## Data flow

```text
Document Model ──DOMRenderer──▶ contenteditable         (render)

DOM events ──Editor──▶ Transaction ──▶ Document Model   (dispatch)
```

- **Render** happens only on explicit changes (`setHTML`, `setJSON`, `clear`,
  commands, paste) and rebuilds the DOM from the model.
- **Input** is captured by re-parsing the DOM into the model (keystrokes).
- **Dispatch** is the single chokepoint: it records a `Transaction` in history,
  re-renders (for commands/paste), restores the selection, and emits events.

### Current simplification

Input sync re-parses the whole DOM. This keeps caret handling simple but is not
incremental. A step-based transaction system (`insert`/`delete`/`addMark`) is
the planned replacement.

## Selection

The selection layer maps DOM positions ↔ flat model positions:

- `buildDOMIndex` walks the live DOM and the model in lockstep, recording flat
  ranges for every text node and element (mark wrappers are transparent, unknown
  elements are unwrapped, dangerous elements skipped).
- `domPointToPosition` / `modelToDomPoint` convert in each direction, handling
  nested block containers (lists).

The model is always parsed from the DOM before mapping, so the two trees mirror
each other.

## Transactions and history

A `Transaction` is `{ before, after, selection }`. History stores document
references (immutable, so no copying) plus the selection to restore. Consecutive
keystrokes are grouped into a single history entry (500 ms threshold) so undo
does not step character-by-character.

## Sanitization and paste

Paste is `Clipboard → sanitize → parse → model → transaction → insert`. The
`Sanitizer` removes dangerous elements, event handlers, and unsafe URLs
(`javascript:`, `data:`) before parsing. Insertion is done by `insertInline`
(single line / inline HTML) or `replaceBlocks` (multi-block), splitting boundary
blocks.

## Extensions

An `Extension` contributes `nodes`, `marks`, `commands`, `shortcuts`, and
`eventHandlers`. The `ExtensionManager` flattens these; the editor merges them
into its schema, command table, shortcut table and event emitter. Commands
receive a `CommandContext` (`getDocument`, `getSelection`, `apply`,
`setSelection`, `undo`, `redo`, ...) and can use the exported pure transforms.

## Keyboard shortcuts

Shortcuts are expressed as combo strings (`'Mod-b'`, `'Mod-Shift-z'`) normalized
to `mod-alt-shift-key`. `Mod` maps to Ctrl (Windows/Linux) or Cmd (macOS).
Shortcuts resolve to command names.

## Performance

Bundle target: core gzip < 20 kB (currently ~9.5 kB). History shares immutable
documents by reference rather than copying HTML. Remaining performance work:
incremental input sync instead of full re-parse.

## Why not ...

- **Why not use the DOM as state?** The DOM is lossy and browser-specific; a
  serializable model enables history, plugins, collaboration, and serialization.
- **Why not `document.execCommand`?** Deprecated, browser-dependent, and bypasses
  the model; commands must be model-driven for consistency and undo/redo.
- **Why flat positions?** They compose across the whole document and are the
  standard model (ProseMirror) that transactions/plugins build on.
