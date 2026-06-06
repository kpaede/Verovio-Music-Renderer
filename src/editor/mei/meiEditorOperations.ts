import { findElementByXmlId } from './meiEditorDom';
import {
  addVerticalGroup,
  convertNoteAndRest,
  duplicateLastNoteLike,
  flipAttribute,
  isNoteLike,
  moveStaff,
  setAccidental,
  shiftChromatic,
  shiftDuration,
  shiftPitch,
  toggleChord
} from './meiNoteOperations';
import {
  addArpeggio,
  addBeam,
  addBeamSpan,
  addClefChange,
  addControlElement,
  addOctave,
  toggleArticulation
} from './meiInsertOperations';

export interface MeiOperationResult {
  text: string;
  changed: boolean;
  message?: string;
}

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
