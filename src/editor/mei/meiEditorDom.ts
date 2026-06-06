export const XML_NS = 'http://www.w3.org/XML/1998/namespace';

export function findElementByXmlId(doc: Document, id: string): Element | null {
  return Array.from(doc.getElementsByTagName('*')).find((element) => element.getAttribute('xml:id') === id) ?? null;
}

export function createXmlId(doc: Document, prefix: string): string {
  let id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  while (findElementByXmlId(doc, id)) id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  return id;
}

export function setXmlId(doc: Document, element: Element, prefix: string) {
  element.setAttributeNS(XML_NS, 'xml:id', createXmlId(doc, prefix));
}

export function createMeiElement(doc: Document, name: string): Element {
  const namespace = doc.documentElement.namespaceURI;
  const element = namespace ? doc.createElementNS(namespace, name) : doc.createElement(name);
  setXmlId(doc, element, name);
  return element;
}

export function getXmlId(element: Element): string | null {
  return element.getAttribute('xml:id') ?? element.getAttributeNS(XML_NS, 'id');
}

export function getMeasure(element: Element): Element | null {
  return element.closest('measure');
}

export function getStaffNumber(element: Element): string | null {
  return element.getAttribute('staff') ?? element.closest('staff')?.getAttribute('n') ?? null;
}

export function copyAttributes(from: Element, to: Element, keep?: string[]) {
  Array.from(from.attributes).forEach((attr) => {
    if (keep && !keep.includes(attr.name)) return;
    to.setAttribute(attr.name, attr.value);
  });
}
