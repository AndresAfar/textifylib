import { createEditor, toggleMark, type Extension } from '../src/index';

const editorElement = document.querySelector<HTMLElement>('#editor')!;

const highlightExtension: Extension = {
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
};

const editor = createEditor({
  element: editorElement,
  content: '<p>Hello <strong>TextifyLib</strong></p>',
  placeholder: 'Start typing…',
  extensions: [highlightExtension],
});

const outputHTML = document.querySelector<HTMLElement>('#output-html')!;
const outputJSON = document.querySelector<HTMLElement>('#output-json')!;
const outputText = document.querySelector<HTMLElement>('#output-text')!;
const selectionStatus = document.querySelector<HTMLElement>('#selection-status')!;

function updateOutputs(): void {
  outputHTML.textContent = editor.getHTML();
  outputJSON.textContent = JSON.stringify(editor.getJSON(), null, 2);
  outputText.textContent = editor.getText();
}

function updateSelectionStatus(): void {
  const selection = editor.getSelection();
  selectionStatus.textContent = selection
    ? `Selection: { from: ${selection.from}, to: ${selection.to}, empty: ${selection.empty} }`
    : 'Selection: none';
}

function updateToolbarState(): void {
  document.querySelectorAll<HTMLElement>('[data-mark]').forEach((button) => {
    button.classList.toggle('is-active', editor.isActive(button.dataset.mark!));
  });
  document.querySelectorAll<HTMLElement>('[data-heading]').forEach((button) => {
    button.classList.toggle(
      'is-active',
      editor.isActive('heading', { level: Number(button.dataset.heading) }),
    );
  });
  document
    .querySelector('[data-block="paragraph"]')!
    .classList.toggle('is-active', editor.isActive('paragraph'));
  document.querySelectorAll<HTMLElement>('[data-list]').forEach((button) => {
    button.classList.toggle('is-active', editor.isActive(button.dataset.list!));
  });
  document
    .querySelector<HTMLElement>('#highlight')!
    .classList.toggle('is-active', editor.isActive('highlight'));
}

editor.on('update', updateOutputs);
editor.on('selectionUpdate', () => {
  updateToolbarState();
  updateSelectionStatus();
});

// Toolbar buttons must not steal focus/selection from the editor.
document.querySelectorAll<HTMLElement>('#format-toolbar button').forEach((button) => {
  button.addEventListener('mousedown', (event) => event.preventDefault());
});

document.querySelectorAll<HTMLElement>('[data-mark]').forEach((button) => {
  button.addEventListener('click', () => {
    editor.commands[button.dataset.mark as 'bold']();
  });
});

document.querySelectorAll<HTMLElement>('[data-heading]').forEach((button) => {
  button.addEventListener('click', () => {
    editor.commands.heading(Number(button.dataset.heading));
  });
});

document.querySelector<HTMLElement>('[data-block="paragraph"]')!.addEventListener('click', () => {
  editor.commands.paragraph();
});

document.querySelectorAll<HTMLElement>('[data-list]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.list === 'bulletList') editor.commands.bulletList();
    else editor.commands.orderedList();
  });
});

document.querySelector<HTMLElement>('#highlight')!.addEventListener('click', () => {
  (editor.commands['toggleHighlight'] as () => boolean)();
});

document.querySelector<HTMLElement>('#link')!.addEventListener('click', () => {
  const href = window.prompt('Link URL:');
  if (href) editor.commands.link({ href });
});

document.querySelector<HTMLElement>('#unlink')!.addEventListener('click', () => {
  editor.commands.unlink();
});

document.querySelector<HTMLElement>('#undo')!.addEventListener('click', () => {
  editor.commands.undo();
});

document.querySelector<HTMLElement>('#redo')!.addEventListener('click', () => {
  editor.commands.redo();
});

const samples: Record<string, string> = {
  'sample-basic': '<p>This is a plain paragraph.</p>',
  'sample-bold': '<p>Hello <strong>world</strong>, <em>this is TextifyLib</em>.</p>',
  'sample-multi': '<p>First paragraph.</p><p>Second <strong>bold</strong> paragraph.</p>',
};

for (const [id, html] of Object.entries(samples)) {
  document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', () => {
    editor.setHTML(html);
  });
}

document.querySelector<HTMLButtonElement>('#clear')!.addEventListener('click', () => {
  editor.clear();
});

document.querySelector<HTMLButtonElement>('#select-all')!.addEventListener('click', () => {
  editor.commands.selectAll();
  editor.focus();
});

updateOutputs();
updateSelectionStatus();
