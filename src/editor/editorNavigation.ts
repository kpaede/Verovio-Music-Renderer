import { EditorView as CMEditorView } from '@codemirror/view';
import { isMeiText, isXmlText } from './editorCodeblockOptions';
import {
  collectXmlIdCandidatesNearPosition,
  markXmlLineEffect
} from './editorXmlTools';

interface SelectFromEditorClickOptions {
  currentUid?: string;
  editor: CMEditorView;
  event: MouseEvent;
  selectRenderedElement: (uid: string, id: string, additive: boolean) => boolean;
}

export function selectSvgElementFromEditorClick({
  currentUid,
  editor,
  event,
  selectRenderedElement,
}: SelectFromEditorClickOptions) {
  if (!currentUid) return;

  const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos === null) return;

  const text = editor.state.doc.toString();
  if (!isXmlText(text)) return;

  const line = editor.state.doc.lineAt(pos);
  const candidates = collectXmlIdCandidatesNearPosition(text, pos, line.from, line.to);
  const selected = candidates.some((id) => selectRenderedElement(currentUid, id, event.metaKey || event.ctrlKey));
  if (!selected) return;

  editor.dispatch({ effects: markXmlLineEffect.of(line.from) });
}

interface JumpToXmlIdOptions {
  editor?: CMEditorView;
  elementId: string;
}

export function jumpToXmlId({ editor, elementId }: JumpToXmlIdOptions) {
  if (!elementId || !editor) return;

  const doc = editor.state.doc;
  const text = doc.toString();
  const attrMatch = new RegExp(`xml:id\\s*=\\s*["']${escapeRegExp(elementId)}["']`).exec(text);
  if (!attrMatch) {
    if (isMeiText(text)) console.debug(`xml:id not found in editor: ${elementId}`);
    return;
  }

  const tagStart = text.lastIndexOf('<', attrMatch.index);
  const previousTagEnd = text.lastIndexOf('>', attrMatch.index);
  const pos = tagStart > previousTagEnd ? tagStart : attrMatch.index;
  const lineStart = doc.lineAt(pos).from;

  editor.dispatch({
    effects: [
      markXmlLineEffect.of(lineStart),
      CMEditorView.scrollIntoView(pos, { y: 'start', yMargin: 50 })
    ]
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
