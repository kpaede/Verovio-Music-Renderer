import type VerovioMusicRenderer from '../main';
import { playSingleNote } from '../playback/midiController';
import { instanceStateMap, type VerovioContainerElement } from './verovioState';
import { attachNotationDragSelector as attachDragSelector } from './notationDragSelection';

type OpenMusicEditorFn = (
  plugin: VerovioMusicRenderer,
  uid: string,
  elementId: string,
  forceFile?: boolean,
  skipChooseModal?: boolean
) => Promise<void>;

let armedNotationShortcutUid: string | null = null;

export function getActiveSelectedUid(_plugin: VerovioMusicRenderer): string | undefined {
  if (armedNotationShortcutUid && instanceStateMap[armedNotationShortcutUid]?.selectedElementIds.length) {
    return armedNotationShortcutUid;
  }
  return undefined;
}

export function clearNotationSelection(plugin: VerovioMusicRenderer) {
  armedNotationShortcutUid = null;
  plugin.lastClickedUid = null;

  Object.entries(instanceStateMap).forEach(([uid, st]) => {
    if (!st.selectedElementIds.length && !st.lastSelectedElementId) return;
    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
    const wrapper = plugin.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
      `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
    );
    if (wrapper) applyNotationSelection(uid, wrapper);
  });
}

export function attachNotationClickHandlers(uid: string, wrapper: HTMLElement, openMusicEditorForSource: OpenMusicEditorFn) {
  const container = wrapper.closest<VerovioContainerElement>('.verovio-container');
  const plugin = container?._pluginContext;
  if (!plugin) return;

  const selector = [
    'g.note[id]',
    'g.chord[id]',
    'g.rest[id]',
    'g.mRest[id]',
    'g.multiRest[id]',
  ].join(',');

  wrapper.querySelectorAll<SVGElement>(selector).forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (container._suppressNotationClick) {
        container._suppressNotationClick = false;
        return;
      }
      if (isTextClick(event.target)) return;
      const elementId = element.id;
      if (!elementId) return;

      selectNotationElement(uid, wrapper, elementId, event);
      if (instanceStateMap[uid]?.playNoteOnClick) playSingleNote(uid, elementId);
      void openMusicEditorForSource(plugin, uid, elementId, false, true);
    });
  });
}

export function attachNotationDragSelector(uid: string, wrapper: HTMLElement, openMusicEditorForSource: OpenMusicEditorFn) {
  attachDragSelector(uid, wrapper, openMusicEditorForSource, {
    applySelection: applyNotationSelection,
    clearOtherSelections: clearOtherNotationSelections,
    setActiveShortcutUid: (activeUid) => { armedNotationShortcutUid = activeUid; },
  });
}

function isTextClick(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('text,tspan,g.syl,g.verse,g.lyric,g.label,g.dir,g.dynam,g.harm'));
}

function selectNotationElement(uid: string, wrapper: HTMLElement, elementId: string, event: MouseEvent) {
  const st = instanceStateMap[uid];
  if (!st) return;

  if (event.metaKey || event.ctrlKey) {
    st.selectedElementIds = st.selectedElementIds.includes(elementId)
      ? st.selectedElementIds.filter((id) => id !== elementId)
      : [...st.selectedElementIds, elementId];
  } else {
    clearOtherNotationSelections(uid, wrapper);
    st.selectedElementIds = [elementId];
  }
  st.lastSelectedElementId = elementId;
  armedNotationShortcutUid = st.selectedElementIds.length ? uid : null;

  applyNotationSelection(uid, wrapper);
}

export function selectRenderedNotationElement(uid: string, elementId: string, additive = false): boolean {
  const st = instanceStateMap[uid];
  const wrapper = activeDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (!st || !wrapper) return false;

  const element = wrapper.querySelector<SVGElement>(`#${cssEscape(elementId)}`);
  if (!element) return false;

  if (additive) {
    st.selectedElementIds = st.selectedElementIds.includes(elementId)
      ? st.selectedElementIds.filter((id) => id !== elementId)
      : [...st.selectedElementIds, elementId];
  } else {
    clearOtherNotationSelections(uid, wrapper);
    st.selectedElementIds = [elementId];
  }
  st.lastSelectedElementId = st.selectedElementIds.at(-1);
  armedNotationShortcutUid = st.selectedElementIds.length ? uid : null;

  applyNotationSelection(uid, wrapper);
  return true;
}

function clearOtherNotationSelections(activeUid: string, activeWrapper: HTMLElement) {
  const root = activeWrapper.ownerDocument;
  Object.entries(instanceStateMap).forEach(([uid, st]) => {
    if (uid === activeUid || (!st.selectedElementIds.length && !st.lastSelectedElementId)) return;
    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
    if (armedNotationShortcutUid === uid) armedNotationShortcutUid = null;
    const wrapper = root.querySelector<HTMLElement>(`.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`);
    if (wrapper) applyNotationSelection(uid, wrapper);
  });
}

export function applyNotationSelection(uid: string, wrapper: HTMLElement) {
  const st = instanceStateMap[uid];
  if (!st) return;

  wrapper.querySelectorAll('.verovio-selected').forEach((element) => {
    element.classList.remove('verovio-selected', 'no-invert');
  });

  st.selectedElementIds.forEach((id) => {
    const element = wrapper.querySelector<SVGElement>(`#${cssEscape(id)}`);
    if (!element) return;
    element.classList.add('verovio-selected', 'no-invert');
  });
}

function cssEscape(value: string): string {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}
