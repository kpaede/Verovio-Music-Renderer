export interface MeiOperationResult {
  text: string;
  changed: boolean;
  message?: string;
}

const DURATIONS = ['long', 'breve', '1', '2', '4', '8', '16', '32', '64', '128', '256'];
const PITCHES = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

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

    case 'addVerticalGroup':
      changed = addVerticalGroup(doc, elements);
      break;

    case 'toggleChord':
      changed = toggleChord(doc, elements);
      break;

    case 'staffUp':
      elements.forEach((element) => {
        changed = moveStaff(element, -1) || changed;
      });
      break;

    case 'staffDown':
      elements.forEach((element) => {
        changed = moveStaff(element, 1) || changed;
      });
      break;

    case 'addTempo':
      changed = addControlElement(doc, elements, 'tempo', { text: 'Allegro', place: 'above' });
      break;
    case 'addDirective':
      changed = addControlElement(doc, elements, 'dir', { text: 'Directive', place: 'above' });
      break;
    case 'addDynamics':
      changed = addControlElement(doc, elements, 'dynam', { text: 'f', place: 'below' });
      break;
    case 'addSlur':
      changed = addControlElement(doc, elements, 'slur', { curvedir: 'above', useEnd: true });
      break;
    case 'addTie':
      changed = addControlElement(doc, elements, 'tie', { curvedir: 'above', useEnd: true });
      break;
    case 'addCresHairpin':
      changed = addControlElement(doc, elements, 'hairpin', { form: 'cres', place: 'below', useEnd: true });
      break;
    case 'addDimHairpin':
      changed = addControlElement(doc, elements, 'hairpin', { form: 'dim', place: 'below', useEnd: true });
      break;
    case 'addArpeggio':
      changed = addArpeggio(doc, elements);
      break;
    case 'addFermata':
      changed = addControlElement(doc, elements, 'fermata', { place: 'above' });
      break;
    case 'addGlissando':
      changed = addControlElement(doc, elements, 'gliss', { useEnd: true });
      break;
    case 'addPedalDown':
      changed = addControlElement(doc, elements, 'pedal', { dir: 'down', place: 'below' });
      break;
    case 'addPedalUp':
      changed = addControlElement(doc, elements, 'pedal', { dir: 'up', place: 'below' });
      break;
    case 'addTrill':
      changed = addControlElement(doc, elements, 'trill', { place: 'above' });
      break;
    case 'addTurn':
      changed = addControlElement(doc, elements, 'turn', { place: 'above' });
      break;
    case 'addTurnLower':
      changed = addControlElement(doc, elements, 'turn', { form: 'lower', place: 'above' });
      break;
    case 'addMordent':
      changed = addControlElement(doc, elements, 'mordent', { place: 'above' });
      break;
    case 'addMordentUpper':
      changed = addControlElement(doc, elements, 'mordent', { form: 'upper', place: 'above' });
      break;

    case 'addBeam':
      changed = addBeam(doc, elements);
      break;
    case 'addBeamSpan':
      changed = addBeamSpan(doc, elements);
      break;

    case 'addOctave8Above':
      changed = addOctave(doc, elements, 'above', '8');
      break;
    case 'addOctave15Above':
      changed = addOctave(doc, elements, 'above', '15');
      break;
    case 'addOctave8Below':
      changed = addOctave(doc, elements, 'below', '8');
      break;
    case 'addOctave15Below':
      changed = addOctave(doc, elements, 'below', '15');
      break;

    case 'addGClefChangeBefore':
      changed = addClefChange(doc, elements, 'G', '2', true);
      break;
    case 'addGClefChangeAfter':
      changed = addClefChange(doc, elements, 'G', '2', false);
      break;
    case 'addFClefChangeBefore':
      changed = addClefChange(doc, elements, 'F', '4', true);
      break;
    case 'addFClefChangeAfter':
      changed = addClefChange(doc, elements, 'F', '4', false);
      break;
    case 'addCClefChangeBefore':
      changed = addClefChange(doc, elements, 'C', '3', true);
      break;
    case 'addCClefChangeAfter':
      changed = addClefChange(doc, elements, 'C', '3', false);
      break;

    case 'toggleStacc':
      changed = toggleArticulation(doc, elements, 'stacc');
      break;
    case 'toggleAccent':
      changed = toggleArticulation(doc, elements, 'acc');
      break;
    case 'toggleTenuto':
      changed = toggleArticulation(doc, elements, 'ten');
      break;
    case 'toggleMarcato':
      changed = toggleArticulation(doc, elements, 'marc');
      break;
    case 'toggleStacciss':
      changed = toggleArticulation(doc, elements, 'stacciss');
      break;
    case 'toggleSpicc':
      changed = toggleArticulation(doc, elements, 'spicc');
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

function setXmlId(doc: Document, element: Element, prefix: string) {
  element.setAttributeNS(XML_NS, 'xml:id', createXmlId(doc, prefix));
}

function createMeiElement(doc: Document, name: string): Element {
  const namespace = doc.documentElement.namespaceURI;
  const element = namespace ? doc.createElementNS(namespace, name) : doc.createElement(name);
  setXmlId(doc, element, name);
  return element;
}

function getXmlId(element: Element): string | null {
  return element.getAttribute('xml:id') ?? element.getAttributeNS(XML_NS, 'id');
}

function getMeasure(element: Element): Element | null {
  return element.closest('measure');
}

function getStaffNumber(element: Element): string | null {
  return element.getAttribute('staff') ?? element.closest('staff')?.getAttribute('n') ?? null;
}

function addVerticalGroup(doc: Document, elements: Element[]): boolean {
  const used = Array.from(doc.querySelectorAll('[vgrp]'))
    .map((element) => Number.parseInt(element.getAttribute('vgrp') ?? '', 10))
    .filter(Number.isFinite);
  let next = 1;
  while (used.includes(next)) next += 1;
  elements.forEach((element) => element.setAttribute('vgrp', String(next)));
  return elements.length > 0;
}

function toggleChord(doc: Document, elements: Element[]): boolean {
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

function moveStaff(element: Element, delta: number): boolean {
  if (!isNoteLike(element)) return false;
  const current = Number.parseInt(getStaffNumber(element) ?? '', 10);
  if (!Number.isFinite(current)) return false;
  const next = Math.max(1, current + delta);
  if (next === current) return false;
  if (element.closest('staff')?.getAttribute('n') === String(next)) element.removeAttribute('staff');
  else element.setAttribute('staff', String(next));
  return true;
}

interface ControlOptions {
  text?: string;
  place?: string;
  curvedir?: string;
  form?: string;
  dir?: string;
  useEnd?: boolean;
}

function addControlElement(doc: Document, elements: Element[], name: string, options: ControlOptions = {}): boolean {
  const anchors = elements.filter(isNoteLike);
  const start = anchors[0];
  if (!start) return false;
  const measure = getMeasure(start);
  const startId = getXmlId(start);
  if (!measure || !startId) return false;

  const control = createMeiElement(doc, name);
  control.setAttribute('startid', `#${startId}`);
  const end = options.useEnd ? anchors.at(-1) : undefined;
  const endId = end && end !== start ? getXmlId(end) : null;
  if (endId) control.setAttribute('endid', `#${endId}`);

  const staff = getStaffNumber(start);
  if (staff) control.setAttribute('staff', staff);
  if (options.place) control.setAttribute('place', options.place);
  if (options.curvedir) control.setAttribute('curvedir', options.curvedir);
  if (options.form) control.setAttribute('form', options.form);
  if (options.dir) control.setAttribute('dir', options.dir);
  if (options.text) control.textContent = options.text;

  measure.appendChild(control);
  return true;
}

function addArpeggio(doc: Document, elements: Element[]): boolean {
  const anchors = elements.filter((element) => ['note', 'chord'].includes(element.localName));
  if (!anchors.length) return false;
  const measure = getMeasure(anchors[0]);
  if (!measure) return false;
  const arpeg = createMeiElement(doc, 'arpeg');
  arpeg.setAttribute('plist', anchors.map(getXmlId).filter(Boolean).map((id) => `#${id}`).join(' '));
  const staff = getStaffNumber(anchors[0]);
  if (staff) arpeg.setAttribute('staff', staff);
  measure.appendChild(arpeg);
  return true;
}

function addBeam(doc: Document, elements: Element[]): boolean {
  const notes = elements.filter((element) => ['note', 'chord', 'rest'].includes(element.localName));
  if (notes.length < 2) return false;
  const parent = notes[0].parentElement;
  if (!parent || notes.some((note) => note.parentElement !== parent)) return false;
  const beam = createMeiElement(doc, 'beam');
  parent.insertBefore(beam, notes[0]);
  notes.forEach((note) => beam.appendChild(note));
  return true;
}

function addBeamSpan(doc: Document, elements: Element[]): boolean {
  const anchors = elements.filter((element) => ['note', 'chord'].includes(element.localName));
  if (!anchors.length) return false;
  const startId = getXmlId(anchors[0]);
  const endId = getXmlId(anchors.at(-1)!);
  const measure = getMeasure(anchors[0]);
  if (!startId || !endId || !measure) return false;
  const beamSpan = createMeiElement(doc, 'beamSpan');
  beamSpan.setAttribute('startid', `#${startId}`);
  beamSpan.setAttribute('endid', `#${endId}`);
  beamSpan.setAttribute('plist', anchors.map(getXmlId).filter(Boolean).map((id) => `#${id}`).join(' '));
  measure.appendChild(beamSpan);
  return true;
}

function addOctave(doc: Document, elements: Element[], place: string, dis: string): boolean {
  const anchors = elements.filter((element) => ['note', 'chord'].includes(element.localName));
  const start = anchors[0];
  const end = anchors.at(-1);
  if (!start || !end) return false;
  const startId = getXmlId(start);
  const endId = getXmlId(end);
  const measure = getMeasure(start);
  if (!startId || !endId || !measure) return false;
  const octave = createMeiElement(doc, 'octave');
  octave.setAttribute('startid', `#${startId}`);
  octave.setAttribute('endid', `#${endId}`);
  octave.setAttribute('dis', dis);
  octave.setAttribute('dis.place', place);
  measure.appendChild(octave);
  return true;
}

function addClefChange(doc: Document, elements: Element[], shape: string, line: string, before: boolean): boolean {
  const anchor = elements[0]?.closest('chord') ?? elements[0];
  if (!anchor?.parentElement) return false;
  const clef = createMeiElement(doc, 'clef');
  clef.setAttribute('shape', shape);
  clef.setAttribute('line', line);
  const staff = getStaffNumber(anchor);
  if (staff) clef.setAttribute('staff', staff);
  anchor.parentElement.insertBefore(clef, before ? anchor : anchor.nextSibling);
  return true;
}

function toggleArticulation(doc: Document, elements: Element[], artic: string): boolean {
  let changed = false;
  elements.forEach((element) => {
    const targets = element.localName === 'chord' ? [element] : getNotes(element);
    targets.forEach((target) => {
      const existing = Array.from(target.children).find(
        (child) => child.localName === 'artic' && child.getAttribute('artic') === artic
      );
      if (existing) existing.remove();
      else {
        const articElement = createMeiElement(doc, 'artic');
        articElement.setAttribute('artic', artic);
        target.appendChild(articElement);
      }
      changed = true;
    });
  });
  return changed;
}
