import { createMeiElement, getMeasure, getStaffNumber, getXmlId } from './meiEditorDom';
import { getNotes, isNoteLike } from './meiNoteOperations';

interface ControlOptions {
  text?: string;
  place?: string;
  curvedir?: string;
  form?: string;
  dir?: string;
  useEnd?: boolean;
}

export function addControlElement(doc: Document, elements: Element[], name: string, options: ControlOptions = {}): boolean {
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

export function addArpeggio(doc: Document, elements: Element[]): boolean {
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

export function addBeam(doc: Document, elements: Element[]): boolean {
  const notes = elements.filter((element) => ['note', 'chord', 'rest'].includes(element.localName));
  if (notes.length < 2) return false;
  const parent = notes[0].parentElement;
  if (!parent || notes.some((note) => note.parentElement !== parent)) return false;
  const beam = createMeiElement(doc, 'beam');
  parent.insertBefore(beam, notes[0]);
  notes.forEach((note) => beam.appendChild(note));
  return true;
}

export function addBeamSpan(doc: Document, elements: Element[]): boolean {
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

export function addOctave(doc: Document, elements: Element[], place: string, dis: string): boolean {
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

export function addClefChange(doc: Document, elements: Element[], shape: string, line: string, before: boolean): boolean {
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

export function toggleArticulation(doc: Document, elements: Element[], artic: string): boolean {
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
