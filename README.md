# TextifyLib

Headless, lightweight, framework-agnostic rich text editor engine.

TextifyLib is the **engine** behind a rich text editor — not a document editor
application. It owns the editor's logic (document model, parsing, serialization,
history, commands) while the UI is entirely up to you. No toolbar, no CSS, no
components, no framework.

```text
┌─────────────────────────────┐
│          Your UI            │
│  B  I  U  H1  List  Link    │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│       TextifyLib Core       │
│  Editor / State / Commands  │
│  Transactions / History     │
│  Schema / Parser / Serializer│
└──────────────┬──────────────┘
               ▼
       contenteditable DOM
```

## Installation

```bash
npm install textifylib
```

## Quick Start

```ts
import { createEditor } from 'textifylib';

const editor = createEditor({
  element: document.querySelector('#editor')!,
  content: '<p>Hello <strong>world</strong></p>',
});

console.log(editor.getHTML());
// '<p>Hello <strong>world</strong></p>'

console.log(editor.getText());
// 'Hello world'

console.log(editor.getJSON());
// { type: 'doc', content: [ { type: 'paragraph', content: [ ... ] } ] }
```

## API

### Core

| Method                   | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `getHTML()`              | Serialize the document to a clean HTML string.        |
| `getJSON()`              | Return the document model (deep copy).                |
| `getText()`              | Return the plain text content.                        |
| `setHTML(html)`          | Replace the document by parsing an HTML string.       |
| `setJSON(json)`          | Replace the document with a JSON tree.                |
| `clear()`                | Reset the editor to an empty paragraph.               |
| `focus()`                | Focus the editable surface.                           |
| `blur()`                 | Blur the editable surface.                            |
| `isFocused()`            | Whether the editable surface has focus.               |
| `isEmpty()`              | Whether the document contains no text.                |
| `getSelection()`         | The current selection as `{ from, to, empty }`.       |
| `setSelection(from, to)` | Set the selection from flat model positions.          |
| `getActiveMarks()`       | Marks active at the caret or common to the selection. |
| `isActive(name, attrs?)` | Whether a mark/node is active at the selection.       |
| `commands.*`             | Run formatting/undo commands (see below).             |
| `can().*`                | Query whether a command is currently applicable.      |
| `on(event, cb)`          | Subscribe to an event (`update`, `transaction`, ...). |
| `off(event, cb)`         | Unsubscribe from an event.                            |
| `destroy()`              | Detach all listeners and release the editor.          |

### Options

```ts
interface EditorOptions {
  element: HTMLElement; // required
  content?: string; // initial HTML
  editable?: boolean; // default true
  placeholder?: string; // shown via data-placeholder attribute
  extensions?: Extension[]; // nodes, marks, commands, shortcuts, events
}
```

## Commands

```ts
editor.commands.bold(); // toggle bold on the selection
editor.commands.italic();
editor.commands.underline();
editor.commands.strike();

editor.commands.heading(2); // set block to <h2>
editor.commands.paragraph(); // set block to <p>

editor.commands.bulletList(); // wrap selection in <ul>
editor.commands.orderedList(); // wrap selection in <ol>

editor.commands.link({ href: 'https://example.com' });
editor.commands.unlink();

editor.commands.selectAll(); // select the whole document

editor.commands.undo();
editor.commands.redo();

editor.can().bold(); // whether a command is currently applicable
editor.can().undo();
```

Each command operates on the current selection. Commands mutate the document
model, re-render, and restore the selection. Mark commands currently require a
non-empty selection.

`isActive(name, attrs?)` reports the active state:

```ts
editor.isActive('bold');
editor.isActive('heading', { level: 2 });
editor.isActive('link', { href: 'https://example.com' });
```

## Selection

The selection layer maps between browser (DOM) positions and flat model
positions (ProseMirror-style integer offsets, where block boundaries occupy a
position). It powers the commands, `isActive`, and `getActiveMarks`:

```ts
editor.getSelection(); // { from: number, to: number, empty: boolean } | null
editor.setSelection(from, to); // programmatically set the selection
editor.getActiveMarks(); // e.g. [{ type: 'bold' }]
```

## Events

```ts
editor.on('update', ({ editor }) => console.log(editor.getHTML()));
editor.on('selectionUpdate', ({ selection }) => console.log(selection));
editor.on('transaction', ({ transaction }) => console.log(transaction));
editor.on('focus', () => {});
editor.on('blur', () => {});

editor.off('update', handler);
```

Every document change flows through a single dispatch path that records a
`Transaction` in the undo/redo history and emits `update` and `transaction`.
Undo/redo also emit `update`. Consecutive keystrokes are grouped into a single
history entry (500 ms threshold).

## Extensions

Extensions register node/mark specs, commands, shortcuts and event handlers:

```ts
import { createEditor, toggleMark, type Extension } from 'textifylib';

const HighlightExtension: Extension = {
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
  shortcuts: { 'Mod-h': 'toggleHighlight' },
  eventHandlers: { update: ({ editor }) => console.log(editor.getHTML()) },
};

const editor = createEditor({
  element,
  extensions: [HighlightExtension],
});

editor.commands.toggleHighlight();
```

A command receives a `CommandContext` (`getDocument`, `getSelection`, `apply`,
`setSelection`, `undo`, `redo`, `canUndo`, `canRedo`) and can use the exported
pure transforms (`toggleMark`, `setMark`, `removeMark`, `setBlockType`,
`toggleList`).

## Shortcuts

Built-in keyboard shortcuts (`Mod` is Ctrl on Windows/Linux, Cmd on macOS):

| Combo         | Command   |
| ------------- | --------- |
| `Mod-B`       | bold      |
| `Mod-I`       | italic    |
| `Mod-U`       | underline |
| `Mod-Z`       | undo      |
| `Mod-Shift-Z` | redo      |

Extensions add shortcuts via the `shortcuts` map (combo → command name).

## JSON format

The document model is the single source of truth. It is a tree of nodes:

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

Supported nodes: `doc`, `paragraph`, `heading`, `bulletList`, `orderedList`,
`listItem`, `text`.
Supported marks: `bold`, `italic`, `underline`, `strike`, `link`.

## HTML

`setHTML()` parses HTML into the model; `getHTML()` serializes the model back to
clean, consistent HTML. Unknown elements are unwrapped (their inline text is
kept) and dangerous elements (`script`, `iframe`, ...) are dropped.

## Paste

Pasting is intercepted and processed as `Clipboard → sanitize → parse → model →
transaction → insert`, so arbitrary HTML is never inserted directly:

- `text/html` is sanitized (dangerous elements, event handlers and unsafe
  `javascript:`/`data:` URLs are removed), parsed, and inserted at the selection.
- `text/plain` is inserted inline (single line) or as paragraphs (multi-line).
- Pasted content is recorded in the undo history.

The `Sanitizer` is configurable (`blockedTags`, `allowedSchemes`,
`urlAttributes`) and can be subclassed for stricter or custom rules.

## Headless architecture

The core is divided into small, single-responsibility modules:

- `model/` — the document model (`Node`, `Mark`), independent of the DOM.
- `schema/` — node and mark specs (name, group, `toDOM`, `parse`).
- `serialization/` — `HTMLParser`, `HTMLSerializer`, plain-text extraction.
- `dom/` — `DOMRenderer` projects the model into the contenteditable element.
- `selection/` — DOM ↔ model position mapping.
- `core/` — the `Editor`, `Transaction`, `History`, and the `createEditor()` factory.

Data flows in two directions, always through the model:

```text
Document Model ──DOMRenderer──▶ contenteditable        (render)

DOM events ──Editor──▶ Transaction ──▶ Document Model  (dispatch)
```

The DOM is never the source of truth. All document changes flow through a single
`dispatch` path: a pure transform produces the next document, which is recorded
as a `Transaction` in the history, rendered (for commands), and emitted to
listeners. Keystrokes are captured by re-parsing the DOM into the model.

The selection layer maps between DOM positions and flat model positions
(ProseMirror-style integer offsets). Commands read the current selection, mutate
the model through pure transforms, re-render, then restore the selection from
the (unchanged) flat positions.

### Current milestone simplifications

The current milestones intentionally defer a few things, documented so future
work can replace them cleanly:

1. **Input sync re-parses the whole DOM.** Later milestones will replace this
   with incremental, step-based transactions (`insert`/`delete`/`addMark`).
2. **History stores whole document states.** Documents are immutable, so states
   are shared by reference (no copying), but a step-based history with
   invertible steps will reduce memory further.
3. **Collapsed-selection marks are no-ops.** Applying a mark with no text
   selected does nothing; "stored marks" (marks applied to the next typed
   character) land with the transaction/input pipeline.

## Roadmap

- **Milestone 1 — Core** ✅ TypeScript, editor, contenteditable, document model,
  paragraph/text, HTML parser & serializer, `getHTML`/`setHTML`/`getText`.
- **Milestone 2 — Formatting** ✅ bold, italic, underline, strike, headings,
  links, `commands`/`can()`/`isActive`, selection layer.
- **Milestone 3 — Selection** ✅ public `getSelection`/`setSelection`,
  `selectAll`, `getActiveMarks`, DOM ↔ model position mapping.
- **Milestone 4 — History** ✅ transactions, undo, redo, events.
- **Milestone 5 — Lists** ✅ bullet list, ordered list, list item.
- **Milestone 6 — Extensions** ✅ extension manager, custom commands/marks/nodes,
  shortcuts.
- **Milestone 7 — Paste** ✅ plain text, HTML, sanitization.
- **Milestone 8 — Polish** ✅ tests, coverage, performance, docs, npm package.

## Development

```bash
npm install
npm run test          # run tests (Vitest)
npm run test:coverage # run tests with coverage (thresholds enforced)
npm run typecheck     # TypeScript strict check
npm run lint          # ESLint
npm run build         # typecheck + build the library
npm run dev           # start the demo (vanilla JS/TS)
npm run bundle:size   # build and report gzip size
```

Bundle size: core gzip < 20 kB (currently ~9.5 kB). Test coverage is measured
with thresholds (90% lines/functions/statements, 70% branches).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the design decisions and rationale.

## License

MIT
