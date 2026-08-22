import type { Node as EditorNode } from '../model/types';
import { DOM_HOLE, type DOMOutputSpec, type Schema } from '../schema/Schema';

/**
 * Projects the document model into a live DOM subtree.
 *
 * The renderer builds real DOM nodes (not HTML strings) from the model so the
 * browser maintains caret/selection naturally. Rendering only happens on
 * explicit changes (`setHTML`, `setJSON`, `clear`), never on every keystroke.
 */
export class DOMRenderer {
  constructor(private readonly schema: Schema) {}

  render(element: HTMLElement, doc: EditorNode): void {
    element.textContent = '';
    for (const child of doc.content ?? []) {
      element.appendChild(this.renderNode(child));
    }
  }

  private renderNode(node: EditorNode): globalThis.Node {
    if (node.type === 'text') return this.renderText(node);

    const spec = this.schema.node(node.type);
    const domSpec = spec.toDOM?.(node);

    // Transparent nodes (like `doc`) render their children directly.
    if (!domSpec) {
      const fragment = document.createDocumentFragment();
      for (const child of node.content ?? []) {
        fragment.appendChild(this.renderNode(child));
      }
      return fragment;
    }

    return this.renderSpec(domSpec, node.content ?? []);
  }

  private renderText(node: EditorNode): globalThis.Node {
    const marks = node.marks ?? [];
    if (marks.length === 0) return document.createTextNode(node.text ?? '');

    let current: globalThis.Node = document.createTextNode(node.text ?? '');
    for (let i = marks.length - 1; i >= 0; i--) {
      const spec = this.schema.mark(marks[i]!.type);
      const wrapper = this.createElement(spec.toDOM(marks[i]!));
      wrapper.appendChild(current);
      current = wrapper;
    }
    return current;
  }

  private renderSpec(domSpec: DOMOutputSpec, children: EditorNode[]): globalThis.Node {
    if (typeof domSpec === 'string') {
      return document.createElement(domSpec);
    }

    const [tag, attrs, hole] = domSpec;
    const element = document.createElement(tag);
    if (attrs) applyAttributes(element, attrs);

    if (hole === DOM_HOLE) {
      for (const child of children) {
        element.appendChild(this.renderNode(child));
      }
    }
    return element;
  }

  private createElement(domSpec: DOMOutputSpec): HTMLElement {
    const tag = typeof domSpec === 'string' ? domSpec : domSpec[0];
    const element = document.createElement(tag);
    if (typeof domSpec !== 'string' && domSpec[1]) {
      applyAttributes(element, domSpec[1]);
    }
    return element;
  }
}

function applyAttributes(element: HTMLElement, attrs: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(attrs)) {
    element.setAttribute(key, String(value));
  }
}
