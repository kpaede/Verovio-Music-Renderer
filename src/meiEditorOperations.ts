export interface MeiOperationResult {
  text: string;
  changed: boolean;
  message?: string;
}

const DURATIONS = ['long', 'breve', '1', '2', '4', '8', '16', '32', '64', '128', '256'];
const PITCHES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

export function applyMeiEditorCommand(commandId: string, meiText: string, selectedIds: string[]): MeiOperationResult {
  if (!selectedIds.length) return { text: meiText, changed: false, message: 'Select one or more MEI elements first.' };

  const doc = new DOMParser().parseFromString(meiText, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return { text: meiText, changed: false, message: 'MEI XML could not be parsed.' };
  }

  const elements = selectedIds
    .map((id) => findElementByXmlId(doc, id))
    .filter((element): element is Element => Boolean(element));

  if (!elements.length) return { text: meiText, changed: false, message: 'Selected MEI elements were not found in the editor.' };

  let changed = false;

  switch (commandId) {
    case 'delete':
      elements.forEach((element) => {
        element.remove();
        changed = true;
      });
      break;

    case 'convertNoteToRest':
      elements.forEach((element) => {
        changed = convertNoteAndRest(doc, element) || changed;
      });
      break;

    case 'toggleDots':
      elements.forEach((element) => {
        if (!isNoteLike(element)) return;
        if (element.getAttribute('dots')) element.removeAttribute('dots');
        else element.setAttribute('dots', '1');
        changed = true;
      });
      break;

    case 'increaseDur':
      elements.forEach((element) => {
        changed = shiftDuration(element, -1) || changed;
      });
      break;

    case 'decreaseDur':
      elements.forEach((element) => {
        changed = shiftDuration(element, 1) || changed;
      });
      break;

    case 'pitchUpDiat':
      elements.forEach((element) => {
        changed = shiftPitch(element, 1, 0) || changed;
      });
      break;

    case 'pitchDownDiat':
      elements.forEach((element) => {
        changed = shiftPitch(element, -1, 0) || changed;
      });
      break;

    case 'pitchOctaveUp':
      elements.forEach((element) => {
        changed = shiftPitch(element, 0, 1) || changed;
      });
      break;

    case 'pitchOctaveDown':
      elements.forEach((element) => {
        changed = shiftPitch(element, 0, -1) || changed;
      });
      break;

    case 'pitchChromUp':
      elements.forEach((element) => {
        changed = shiftChromatic(element, 1) || changed;
      });
      break;

    case 'pitchChromDown':
      elements.forEach((element) => {
        changed = shiftChromatic(element, -1) || changed;
      });
      break;

    case 'invertPlacement':
      elements.forEach((element) => {
        changed = flipAttribute(element, 'place', 'above', 'below') || changed;
        changed = flipAttribute(element, 'stem.dir', 'up', 'down') || changed;
        changed = flipAttribute(element, 'curvedir', 'above', 'below') || changed;
      });
      break;

    case 'betweenPlacement':
      elements.forEach((element) => {
        element.setAttribute('place', 'between');
        changed = true;
      });
      break;

    case 'addSharp':
      changed = setAccidental(elements, 's') || changed;
      break;
    case 'addDoubleSharp':
      changed = setAccidental(elements, 'ss') || changed;
      break;
    case 'addNatural':
      changed = setAccidental(elements, 'n') || changed;
      break;
    case 'addFlat':
      changed = setAccidental(elements, 'f') || changed;
      break;
    case 'addDoubleFlat':
      changed = setAccidental(elements, 'ff') || changed;
      break;

    case 'addNote':
      changed = duplicateLastNoteLike(doc, elements);
      break;

    default:
      return { text: meiText, changed: false, message: `MEI operation not wired yet: ${commandId}` };
  }

  if (!changed) return { text: meiText, changed: false, message: `No applicable selected elements for ${commandId}.` };
  return { text: new XMLSerializer().serializeToString(doc), changed: true };
}

function findElementByXmlId(doc: Document, id: string): Element | null {
  return Array.from(doc.getElementsByTagName('*')).find((element) => element.getAttribute('xml:id') === id) ?? null;
}

function isNoteLike(element: Element): boolean {
  return ['note', 'rest', 'mRest', 'multiRest', 'chord'].includes(element.localName);
}

function convertNoteAndRest(doc: Document, element: Element): boolean {
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

function copyAttributes(from: Element, to: Element, keep?: string[]) {
  Array.from(from.attributes).forEach((attr) => {
    if (keep && !keep.includes(attr.name)) return;
    to.setAttribute(attr.name, attr.value);
  });
}

function shiftDuration(element: Element, delta: number): boolean {
  if (!isNoteLike(element)) return false;
  const current = element.getAttribute('dur');
  const index = current ? DURATIONS.indexOf(current) : -1;
  if (index < 0) return false;
  const next = DURATIONS[Math.min(Math.max(index + delta, 0), DURATIONS.length - 1)];
  if (next === current) return false;
  element.setAttribute('dur', next);
  return true;
}

function shiftPitch(element: Element, diatonicDelta: number, octaveDelta: number): boolean {
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

function shiftChromatic(element: Element, delta: number): boolean {
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

function getNotes(element: Element): Element[] {
  if (element.localName === 'note') return [element];
  if (element.localName === 'chord') return Array.from(element.children).filter((child) => child.localName === 'note');
  return [];
}

function flipAttribute(element: Element, attr: string, first: string, second: string): boolean {
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

function setAccidental(elements: Element[], accid: string): boolean {
  let changed = false;
  elements.forEach((element) => {
    getNotes(element).forEach((note) => {
      note.setAttribute('accid', accid);
      changed = true;
    });
  });
  return changed;
}

function duplicateLastNoteLike(doc: Document, elements: Element[]): boolean {
  const anchor = [...elements].reverse().find(isNoteLike);
  if (!anchor?.parentElement) return false;

  const clone = anchor.cloneNode(true) as Element;
  clone.setAttribute('xml:id', createXmlId(doc, clone.localName));
  anchor.parentElement.insertBefore(clone, anchor.nextSibling);
  return true;
}

function createXmlId(doc: Document, prefix: string): string {
  let id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  while (findElementByXmlId(doc, id)) id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  return id;
}
