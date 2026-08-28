# Changelog

All notable changes to TextifyLib will be documented in this file.

## [0.1.0] - 2026-08-28

### Added

- Project scaffold: TypeScript (strict), Vite, Vitest, ESLint, Prettier.
- Document model (`doc`, `paragraph`, `heading`, `text`) independent of the DOM.
- Schema of node and mark specs (`bold`, `italic`, `underline`, `strike`, `link`)
  for future extensibility.
- `HTMLParser` (HTML → model) with basic dangerous-element stripping.
- `HTMLSerializer` (model → HTML) with minimal mark nesting.
- Plain-text extraction (`getText`).
- `createEditor()` and the `Editor` class with `getHTML`, `getJSON`, `getText`,
  `setHTML`, `setJSON`, `clear`, `focus`, `blur`, `isFocused`, `isEmpty`,
  `isActive`, `destroy`.
- Flat document positions (ProseMirror-style) with DOM ↔ model selection
  mapping and selection restore.
- Formatting commands: `bold`, `italic`, `underline`, `strike`, `heading`,
  `paragraph`, `link`, `unlink`, plus `can()`.
- Selection API: `getSelection`, `setSelection`, `getActiveMarks` and the
  `selectAll` command, built on the DOM ↔ model position mapping.
- Transaction concept (`Transaction`) and a central dispatch path for all
  document changes.
- Undo/redo history with input grouping (consecutive keystrokes merge).
- Event emitter: `update`, `transaction`, `selectionUpdate`, `focus`, `blur`.
- Lists: `bulletList`, `orderedList`, `listItem` nodes with parsing,
  serialization, and `bulletList`/`orderedList` commands (wrap, lift, switch).
- Content-model expressions on node specs (`inline*`, `block*`, `listItem+`) to
  drive recursive parsing/serialization and selection mapping.
- Extensions: `Extension` interface and `ExtensionManager` for custom nodes,
  marks, commands, shortcuts, and event handlers.
- Keyboard shortcuts (`Mod`-based) with built-in bindings (bold, italic,
  underline, undo, redo) and extension-provided shortcuts.
- Paste: `text/html` (sanitized + parsed) and `text/plain` (inline or blocks)
  inserted at the selection and recorded in history.
- `Sanitizer`: removes dangerous elements, event handlers and unsafe URLs
  (`javascript:`, `data:`); configurable.
- `contenteditable` DOM renderer with input/composition sync.
- Test coverage tooling (`@vitest/coverage-v8`) with enforced thresholds.
- `ARCHITECTURE.md` documenting the design decisions; npm package metadata.
- Unit tests (Vitest + jsdom) for the core, serialization and commands.
- Minimal vanilla demo with a formatting toolbar.
- Font family support: `fontFamily` mark, `fontFamily`/`unsetFontFamily` commands,
  and a curated `FONT_FAMILIES` catalog (Ubuntu Mono, Times New Roman,
  Inconsolata, ...) with a font picker in the demo.
- Stored marks: toggling a mark (`bold`, `italic`, `link`, `fontFamily`, ...) at
  a collapsed caret persists it so subsequent typing inherits the mark.
- Line breaks: `Enter` splits the current block (new paragraph) and `Shift+Enter`
  inserts a `hardBreak` (`<br>`) within the block, both driven through the model
  so the caret stays on the new line.
