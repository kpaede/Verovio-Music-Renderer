export function getMidiNotesForElement(mei: string, elementId: string): number[] {
  const doc = new DOMParser().parseFromString(mei, 'application/xml');
  const element = findElementByXmlId(doc, elementId);
  if (!element) return [];

  const noteElements = element.tagName.toLowerCase() === 'note'
    ? [element]
    : Array.from(element.querySelectorAll('note'));

  return noteElements
    .map(getMidiNote)
    .filter((note): note is number => typeof note === 'number');
}

function findElementByXmlId(doc: Document, elementId: string): Element | undefined {
  return Array.from(doc.getElementsByTagName('*')).find((element) =>
    element.getAttribute('xml:id') === elementId || element.getAttribute('id') === elementId
  );
}

function getMidiNote(note: Element): number | undefined {
  if (note.getAttribute('grace') || note.getAttribute('cue')) return undefined;

  const pname = note.getAttribute('pname')?.toLowerCase();
  const oct = Number(note.getAttribute('oct'));
  if (!pname || !Number.isFinite(oct)) return undefined;

  const pitchClass = pitchClassForPname(pname);
  if (pitchClass === undefined) return undefined;

  return (oct + 1) * 12 + pitchClass + accidentalOffset(note);
}

function pitchClassForPname(pname: string): number | undefined {
  return { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[pname as 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'];
}

function accidentalOffset(note: Element): number {
  const accid = note.getAttribute('accid.ges') || note.getAttribute('accid') || '';
  if (accid.includes('ss')) return 2;
  if (accid.includes('ff')) return -2;
  if (accid.includes('s')) return 1;
  if (accid.includes('f')) return -1;
  return 0;
}
