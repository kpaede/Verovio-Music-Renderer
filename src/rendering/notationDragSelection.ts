import type VerovioMusicRenderer from '../main';
import { instanceStateMap, type VerovioContainerElement } from './verovioState';

type OpenMusicEditorFn = (
  plugin: VerovioMusicRenderer,
  uid: string,
  elementId: string,
  forceFile?: boolean,
  skipChooseModal?: boolean
) => Promise<void>;

interface DragSelectionCallbacks {
  applySelection: (uid: string, wrapper: HTMLElement) => void;
  clearOtherSelections: (uid: string, wrapper: HTMLElement) => void;
  setActiveShortcutUid: (uid: string | null) => void;
}

export function attachNotationDragSelector(
  uid: string,
  wrapper: HTMLElement,
  openMusicEditorForSource: OpenMusicEditorFn,
  callbacks: DragSelectionCallbacks
) {
  const svg = wrapper.querySelector<SVGSVGElement>('svg');
  const container = wrapper.closest<VerovioContainerElement>('.verovio-container');
  if (!svg || !container) return;
  const plugin = container._pluginContext;

  let isMouseDown = false;
  let isDragging = false;
  let startClient: { x: number; y: number } | null = null;
  let selectionRect: SVGRectElement | null = null;
  let baseSelection: string[] = [];
  let selectableElements: SVGGraphicsElement[] = [];
  let latestElementId = '';

  svg.addEventListener('click', (event) => {
    if (container._suppressNotationClick) {
      container._suppressNotationClick = false;
      return;
    }
    if (isTextClick(event.target)) return;
    if (event.target instanceof Element && event.target.closest('g.note[id],g.chord[id],g.rest[id],g.mRest[id],g.multiRest[id]')) return;

    const st = instanceStateMap[uid];
    if (!st || st.selectedElementIds.length === 0) return;

    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
    callbacks.setActiveShortcutUid(null);
    callbacks.applySelection(uid, wrapper);
  });

  svg.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('g.note[id],g.chord[id],g.rest[id],g.mRest[id],g.multiRest[id]')) return;
    if (isTextClick(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }

    container._suppressNotationClick = false;
    isMouseDown = true;
    isDragging = false;
    startClient = {
      x: event.clientX + wrapper.scrollLeft,
      y: event.clientY + wrapper.scrollTop,
    };
    baseSelection = instanceStateMap[uid]?.selectedElementIds ?? [];
    selectableElements = getDragSelectableElements(wrapper);
    latestElementId = '';
    svg.ownerDocument.addEventListener('mousemove', onMouseMove);
    svg.ownerDocument.addEventListener('mouseup', finishDrag);
  });

  const onMouseMove = (event: MouseEvent) => {
    if (!isMouseDown || !startClient) return;

    const dx = event.clientX + wrapper.scrollLeft - startClient.x;
    const dy = event.clientY + wrapper.scrollTop - startClient.y;
    if (!isDragging && Math.hypot(dx, dy) < 4) return;

    const pageMargin = svg.querySelector<SVGGElement>('g.page-margin') ?? svg;
    const matrix = pageMargin.getScreenCTM()?.inverse();
    if (!matrix) return;

    isDragging = true;
    container._suppressNotationClick = true;
    event.preventDefault();
    event.stopPropagation();

    if (!selectionRect) {
      selectionRect = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectionRect.setAttribute('class', 'verovio-drag-selection-rect no-invert');
      pageMargin.appendChild(selectionRect);
    }

    const startPoint = transformPoint(startClient, matrix);
    const endPoint = transformPoint({ x: event.clientX, y: event.clientY }, matrix);
    const bounds = normalizeSvgRect(startPoint, endPoint);
    updateDragSelectionRect(uid, selectionRect, bounds);
    const latest = updateDragSelection(uid, wrapper, selectableElements, bounds, baseSelection, event, endPoint, callbacks);
    if (latest && latest !== latestElementId) {
      latestElementId = latest;
      if (plugin) void openMusicEditorForSource(plugin, uid, latest, false, true);
    }
  };

  const finishDrag = (event: MouseEvent) => {
    if (!isMouseDown) return;
    if (isDragging) {
      event.preventDefault();
      event.stopPropagation();
      container._suppressNotationClick = true;
      window.setTimeout(() => {
        container._suppressNotationClick = false;
      }, 0);
    }
    selectionRect?.remove();
    selectionRect = null;
    startClient = null;
    selectableElements = [];
    baseSelection = [];
    latestElementId = '';
    isMouseDown = false;
    isDragging = false;
    svg.ownerDocument.removeEventListener('mousemove', onMouseMove);
    svg.ownerDocument.removeEventListener('mouseup', finishDrag);
  };
}

function getDragSelectableElements(wrapper: HTMLElement): SVGGraphicsElement[] {
  const selector = [
    'g.note[id]',
    'g.chord[id]',
    'g.rest[id]',
    'g.mRest[id]',
    'g.multiRest[id]',
    'g.measure[id]',
  ].join(',');

  return Array.from(wrapper.querySelectorAll<SVGGraphicsElement>(selector));
}

function transformPoint(point: { x: number; y: number }, matrix: DOMMatrix) {
  return new DOMPoint(point.x, point.y).matrixTransform(matrix);
}

function normalizeSvgRect(start: DOMPoint, end: DOMPoint) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function updateDragSelectionRect(uid: string, rect: SVGRectElement, bounds: { x: number; y: number; width: number; height: number }) {
  rect.setAttribute('x', String(bounds.x));
  rect.setAttribute('y', String(bounds.y));
  rect.setAttribute('width', String(bounds.width));
  rect.setAttribute('height', String(bounds.height));
  const color = instanceStateMap[uid]?.selectionColor || '#0066FF';
  const strokeWidth = 1.25;
  rect.setAttribute('stroke-width', String(strokeWidth));
  rect.setAttribute('stroke-dasharray', '5 4');
  rect.setAttribute('stroke', color);
  rect.setAttribute('stroke-opacity', '0.85');
  rect.setAttribute('fill', color);
  rect.setAttribute('fill-opacity', '0.035');
  rect.setAttribute('pointer-events', 'none');
  rect.setAttribute('vector-effect', 'non-scaling-stroke');
}

function updateDragSelection(
  uid: string,
  wrapper: HTMLElement,
  elements: SVGGraphicsElement[],
  bounds: { x: number; y: number; width: number; height: number },
  baseSelection: string[],
  event: MouseEvent,
  cursorPoint: DOMPoint,
  callbacks: DragSelectionCallbacks
) {
  const st = instanceStateMap[uid];
  if (!st) return undefined;

  const additive = event.metaKey || event.ctrlKey;
  if (!additive) callbacks.clearOtherSelections(uid, wrapper);
  const selected = new Set(additive ? baseSelection : []);
  let latest: { id: string; distance: number } | undefined;

  elements.forEach((element) => {
    const center = getElementCenter(element);
    if (!center || !isPointInRect(center, bounds)) return;

    const id = event.altKey && element.classList.contains('note')
      ? element.closest<SVGGraphicsElement>('g.chord[id]')?.id ?? element.id
      : element.id;
    if (!id) return;

    if (additive && baseSelection.includes(id)) selected.delete(id);
    else selected.add(id);

    const distance = Math.abs(center.x - cursorPoint.x) + Math.abs(center.y - cursorPoint.y);
    if (!latest || distance < latest.distance) latest = { id, distance };
  });

  st.selectedElementIds = Array.from(selected);
  st.lastSelectedElementId = latest?.id;
  callbacks.setActiveShortcutUid(st.selectedElementIds.length ? uid : null);
  callbacks.applySelection(uid, wrapper);
  return latest?.id;
}

function getElementCenter(element: SVGGraphicsElement): { x: number; y: number } | null {
  try {
    const target = element.classList.contains('note')
      ? element.querySelector<SVGGraphicsElement>('g.notehead,path.notehead,use.notehead') ?? element
      : element;
    const box = target.getBBox();
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  } catch {
    return null;
  }
}

function isPointInRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function isTextClick(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('text,tspan,g.syl,g.verse,g.lyric,g.label,g.dir,g.dynam,g.harm'));
}
