import { copyAttributes, createMeiElement, createXmlId, getStaffNumber } from './meiEditorDom';

const DURATIONS = ['long', 'breve', '1', '2', '4', '8', '16', '32', '64', '128', '256'];
const PITCHES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

export function isNoteLike(element: Element): boolean {
  return ['note', 'rest', 'mRest', 'multiRest', 'chord'].includes(element.localName);
}

export function convertNoteAndRest(doc: Document, element: Element): boolean {
  if (element.localName === 'note') {
    const rest = doc.createElementNS(element.namespaceURI, 'rest');
    copyAttributes(element, rest, ['dur', 'dots', 'staff', 'layer', 'xml:id']);
    element.replaceWith(rest);
    return true;
  }

  if (element.localName === 'rest') {
    const note = doc.createElementNS(element.namespaceURI, 'note');
    copyAttributes(element, note, ['dur', 'dots', 'staff', 'layer', 'xml:id']);
    note.setAttribute('pname', 'c');
    note.setAttribute('oct', '4');
    element.replaceWith(note);
    return true;
  }

  return false;
}

export function shiftDuration(element: Element, delta: number): boolean {
  if (!isNoteLike(element)) return false;
  const current = element.getAttribute('dur');
  const index = current ? DURATIONS.indexOf(current) : -1;
  if (index < 0) return false;
  const next = DURATIONS[Math.min(Math.max(index + delta, 0), DURATIONS.length - 1)];
  if (next === current) return false;
  element.setAttribute('dur', next);
  return true;
}

export function shiftPitch(element: Element, diatonicDelta: number, octaveDelta: number): boolean {
  const notes = getNotes(element);
  let changed = false;
  notes.forEach((note) => {
    const pname = note.getAttribute('pname')?.toLowerCase();
    const oct = Number.parseInt(note.getAttribute('oct') ?? '', 10);
    if (!pname || !Number.isFinite(oct)) return;

    let pitchIndex = PITCHES.indexOf(pname) + diatonicDelta;
    let nextOct = oct + octaveDelta;
    while (pitchIndex < 0) {
      pitchIndex += PITCHES.length;
      nextOct -= 1;
    }
    while (pitchIndex >= PITCHES.length) {
      pitchIndex -= PITCHES.length;
      nextOct += 1;
    }

    note.setAttribute('pname', PITCHES[pitchIndex]);
    note.setAttribute('oct', String(nextOct));
    changed = true;
  });
  return changed;
}

export function shiftChromatic(element: Element, delta: number): boolean {
  const notes = getNotes(element);
  let changed = false;
  notes.forEach((note) => {
    const accid = note.getAttribute('accid');
    if (delta > 0) {
      note.setAttribute('accid', accid === 's' ? 'ss' : accid === 'f' ? 'n' : 's');
    } else {
      note.setAttribute('accid', accid === 'f' ? 'ff' : accid === 's' ? 'n' : 'f');
    }
    changed = true;
  });
  return changed;
}

export function getNotes(element: Element): Element[] {
  if (element.localName === 'note') return [element];
  if (element.localName === 'chord') return Array.from(element.children).filter((child) => child.localName === 'note');
  return [];
}

export function flipAttribute(element: Element, attr: string, first: string, second: string): boolean {
  const current = element.getAttribute(attr);
  if (current === first) {
    element.setAttribute(attr, second);
    return true;
  }
  if (current === second) {
    element.setAttribute(attr, first);
    return true;
  }
  return false;
}

export function setAccidental(elements: Element[], accid: string): boolean {
  let changed = false;
  elements.forEach((element) => {
    getNotes(element).forEach((note) => {
      note.setAttribute('accid', accid);
      changed = true;
    });
  });
  return changed;
}

export function duplicateLastNoteLike(doc: Document, elements: Element[]): boolean {
  const anchor = [...elements].reverse().find(isNoteLike);
  if (!anchor?.parentElement) return false;

  const clone = anchor.cloneNode(true) as Element;
  clone.setAttribute('xml:id', createXmlId(doc, clone.localName));
  anchor.parentElement.insertBefore(clone, anchor.nextSibling);
  return true;
}

export function addVerticalGroup(doc: Document, elements: Element[]): boolean {
  const used = Array.from(doc.querySelectorAll('[vgrp]'))
    .map((element) => Number.parseInt(element.getAttribute('vgrp') ?? '', 10))
    .filter(Number.isFinite);
  let next = 1;
  while (used.includes(next)) next += 1;
  elements.forEach((element) => element.setAttribute('vgrp', String(next)));
  return elements.length > 0;
}

export function toggleChord(doc: Document, elements: Element[]): boolean {
  if (elements.length === 1 && elements[0].localName === 'chord') {
    const chord = elements[0];
    const parent = chord.parentElement;
    if (!parent) return false;
    const notes = Array.from(chord.children).filter((child) => child.localName === 'note');
    notes.forEach((note) => {
      ['dur', 'dots', 'stem.dir'].forEach((attr) => {
        const value = chord.getAttribute(attr);
        if (value && !note.getAttribute(attr)) note.setAttribute(attr, value);
      });
      parent.insertBefore(note, chord);
    });
    chord.remove();
    return notes.length > 0;
  }

  const notes = elements.filter((element) => element.localName === 'note' && element.parentElement?.localName !== 'chord');
  if (notes.length < 1) return false;
  const parent = notes[0].parentElement;
  if (!parent || notes.some((note) => note.parentElement !== parent)) return false;

  const chord = createMeiElement(doc, 'chord');
  ['dur', 'dots', 'stem.dir'].forEach((attr) => {
    const value = notes[0].getAttribute(attr);
    if (value) chord.setAttribute(attr, value);
  });
  parent.insertBefore(chord, notes[0]);
  notes.forEach((note) => {
    note.removeAttribute('dur');
    note.removeAttribute('dots');
    note.removeAttribute('stem.dir');
    chord.appendChild(note);
  });
  return true;
}

export function moveStaff(element: Element, delta: number): boolean {
  if (!isNoteLike(element)) return false;
  const current = Number.parseInt(getStaffNumber(element) ?? '', 10);
  if (!Number.isFinite(current)) return false;
  const next = Math.max(1, current + delta);
  if (next === current) return false;
  if (element.closest('staff')?.getAttribute('n') === String(next)) element.removeAttribute('staff');
  else element.setAttribute('staff', String(next));
  return true;
}
