import VerovioMusicRenderer from './main';
import MIDI from 'lz-midi';

// Object to store the unique MIDI data by ID
const midiDataMap: Record<string, string> = {};

async function processVerovioCodeBlocks(this: VerovioMusicRenderer, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  if (!window.VerovioToolkit) {
    console.log("Verovio is not yet loaded or failed to load.");
    return;
  }

  const settings = this.settings;

  try {
    const data = await fetchFileData(source.trim());
    window.VerovioToolkit.setOptions({
      "scale": settings.scale,
      "adjustPageHeight": settings.adjustPageHeight,
      "adjustPageWidth": settings.adjustPageWidth,
      "breaks": settings.breaks,
      "pageWidth": settings.pageWidth,
      "midiTempoAdjustment": settings.midiTempoAdjustment,
      "font": settings.font
    });

    window.VerovioToolkit.loadData(data);
    const meiData = window.VerovioToolkit.getMEI({ noLayout: false });
    window.VerovioToolkit.loadData(meiData);
    const svg = window.VerovioToolkit.renderToSVG(1);

    // Create a unique ID for this rendering
    const uniqueId = `rendering-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Generate MIDI data and store it with the unique ID
    const base64midi = window.VerovioToolkit.renderToMIDI();
    midiDataMap[uniqueId] = 'data:audio/midi;base64,' + base64midi;

    const container = document.createElement("div");
    container.className = "verovio-container";
    container.innerHTML = svg;
    const toolbar = createToolbar(uniqueId);
    container.appendChild(toolbar);
    el.appendChild(container);
  } catch (error) {
    console.error("Error rendering data:", error);
    el.innerHTML = `<p>Error rendering data: ${error.message}</p>`;
  }
}

async function fetchFileData(path: string): Promise<string> {
  try {
    let data = '';
    if (isValidUrl(path)) {
      console.log(`Fetching data from URL: ${path}`);
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
      data = await response.text();
    } else {
      console.log(`Fetching data from local file: ${path}`);
      const file = app.vault.getAbstractFileByPath(path);
      if (!file) throw new Error(`File not found: ${path}`);
      data = await app.vault.read(file);
    }
    return data;
  } catch (error) {
    throw new Error(`Failed to fetch file data: ${error.message}`);
  }
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

function createToolbar(uniqueId: string): HTMLDivElement {
  const toolbar = document.createElement("div");
  toolbar.className = "verovio-toolbar";
  const playButton = createButton(playIcon(), () => playMIDI(uniqueId));
  const stopButton = createButton(stopIcon(), stopMIDI);
  const downloadButton = createButton(downloadIcon(), downloadSVG);
  toolbar.appendChild(playButton);
  toolbar.appendChild(stopButton);
  toolbar.appendChild(downloadButton);
  return toolbar;
}

function createButton(iconSvg: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.innerHTML = iconSvg;
  button.onclick = onClick;
  return button;
}

function playIcon(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  `;
}

function stopIcon(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h12v12H6z"/>
    </svg>
  `;
}

function downloadIcon(): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 20h14v-2H5v2zm7-18L5.5 8.5 7 10l3-3v9h2V7l3 3 1.5-1.5L12 2z"/>
    </svg>
  `;
}

async function playMIDI(uniqueId: string) {
  const midiDataUrl = midiDataMap[uniqueId];
  if (midiDataUrl) {
    try {
      // Stop any previous playback before starting new one
      MIDI.Player.stop(); 
      MIDI.Player.loadFile(midiDataUrl, () => {
        MIDI.Player.start();
      });
    } catch (error) {
      console.error(`Error playing MIDI for ${uniqueId}:`, error);
    }
  } else {
    console.error(`MIDI data for ${uniqueId} not found.`);
  }
}

function stopMIDI() {
  MIDI.Player.stop();
}

async function downloadSVG(event: MouseEvent) {
  const container = (event.target as HTMLElement).closest(".verovio-container");
  const svgElement = container.querySelector("svg");
  if (!svgElement) {
    console.error("SVG element not found.");
    return;
  }
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgElement);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "score.svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { processVerovioCodeBlocks };
