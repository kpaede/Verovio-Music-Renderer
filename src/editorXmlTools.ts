import { Decoration, EditorView as CMEditorView } from '@codemirror/view';
import {
  StateEffect,
  StateField
} from '@codemirror/state';

function collectXmlIds(value: string): string[] {
  const ids: string[] = [];
  const regex = /\bxml:id\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) ids.push(match[1]);
  return ids;
}

export function collectXmlIdCandidatesNearPosition(text: string, pos: number, lineFrom: number, lineTo: number): string[] {
  const candidates: string[] = [];
  const add = (ids: string[]) => {
    ids.forEach((id) => {
      if (!candidates.includes(id)) candidates.push(id);
    });
  };

  const lineText = text.slice(lineFrom, lineTo);
  add(collectXmlIds(lineText));
  if (!lineText.includes('<')) return candidates;

  const tagStart = text.lastIndexOf('<', pos);
  const tagEnd = text.indexOf('>', pos);
  if (tagStart >= 0 && tagEnd >= pos) {
    const previousTagEnd = text.lastIndexOf('>', pos);
    if (tagStart > previousTagEnd) add(collectXmlIds(text.slice(tagStart, tagEnd + 1)));
  }

  const contextStart = Math.max(0, pos - 1000);
  add(collectXmlIds(text.slice(contextStart, pos)).reverse());

  return candidates;
}

export const activeLineTheme = CMEditorView.theme({
  '.cm-activeLine': {
    backgroundColor: 'rgba(100, 150, 250, 0.3)',
  }
});

export const codeFontTheme = CMEditorView.theme({
  '& .cm-content': {
    fontSize: '0.85em'
  }
});

export const markXmlLineEffect = StateEffect.define<number | null>();
export const markedXmlLineField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(markXmlLineEffect)) continue;
      value = effect.value === null
        ? Decoration.none
        : Decoration.set([
          Decoration.line({ class: 'verovio-editor-marked-xml-line' }).range(effect.value)
        ]);
    }
    return value;
  },
  provide: (field) => CMEditorView.decorations.from(field)
});
