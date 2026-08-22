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
  placeholder: 'Start writing…',
  extensions: [highlightExtension],
});

const outputHTML = document.querySelector<HTMLElement>('#output-html')!;
const outputJSON = document.querySelector<HTMLElement>('#output-json')!;
const outputText = document.querySelector<HTMLElement>('#output-text')!;
const selectionStatus = document.querySelector<HTMLElement>('#selection-status')!;
const wordCount = document.querySelector<HTMLElement>('#word-count')!;

function updateOutputs(): void {
  outputHTML.textContent = editor.getHTML();
  outputJSON.textContent = JSON.stringify(editor.getJSON(), null, 2);
  outputText.textContent = editor.getText();
  updateWordCount();
}

function updateWordCount(): void {
  const text = editor.getText();
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  wordCount.textContent = `${words} words · ${text.length} chars`;
}

function updateSelectionStatus(): void {
  const selection = editor.getSelection();
  selectionStatus.textContent = selection
    ? `Selection: { from: ${selection.from}, to: ${selection.to}${selection.empty ? ', caret' : ''} }`
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

// Output tabs
let activeTab = 'html';
const panels: Record<string, HTMLElement> = {
  html: outputHTML,
  json: outputJSON,
  text: outputText,
};

document.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab ?? 'html';
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('is-active', p.getAttribute('data-panel') === activeTab);
    });
  });
});

// Copy button
const copyButton = document.querySelector<HTMLElement>('#copy')!;
const copyLabel = document.querySelector<HTMLElement>('#copy-label')!;
const copyIcon = copyButton.querySelector<HTMLElement>('.ic')!;

copyButton.addEventListener('click', () => {
  const content = panels[activeTab]!.textContent ?? '';
  navigator.clipboard.writeText(content).then(
    () => {
      copyLabel.textContent = 'Copied';
      copyIcon.innerHTML = '<use href="#i-check" />';
      window.setTimeout(() => {
        copyLabel.textContent = 'Copy';
        copyIcon.innerHTML = '<use href="#i-copy" />';
      }, 1200);
    },
    () => {
      copyLabel.textContent = 'Failed';
    },
  );
});

const samples: Record<string, string> = {
  'sample-basic': '<p>This is a plain paragraph.</p>',
  'sample-rich':
    '<h1>Welcome to TextifyLib</h1>' +
    '<p>A <strong>headless</strong> rich text engine. Select any text and use the toolbar, or try the <a href="https://example.com">keyboard shortcuts</a>.</p>' +
    '<h2>What you can do</h2>' +
    '<ul><li><em>Italic</em>, <u>underline</u> and <s>strikethrough</s></li><li>Headings, bullet and ordered lists</li><li>Undo / redo and custom extensions</li></ul>',
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
