import VerovioMusicRenderer from './main';
import MIDI from 'lz-midi';
import { exec } from 'child_process';
import { TFile } from 'obsidian';
import * as os from 'os';

// Maps for storing source paths
const sourceMap: Record<string, string> = {};

let currentPage = 1;
let currentElements: { page: number, uniqueId: string } = { page: 1, uniqueId: '' };
const highlightInterval = 50; // Throttle interval in milliseconds
const highlightedNotesCache: Record<string, Set<string>> = {};

async function processVerovioCodeBlocks(this: VerovioMusicRenderer, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    if (!window.VerovioToolkit) {
        const errorMsg = document.createElement('p');
        errorMsg.textContent = 'Verovio is not yet loaded or failed to load.';
        el.appendChild(errorMsg);
        return;
    }

    try {
        // Extract the file path and any options specified in the code block
        const { filePath, options } = extractFilePathAndOptions(source.trim());

        // Fetch the file data
        const data = await fetchFileData(filePath);
        window.VerovioToolkit.setOptions({
            ...this.settings,
            ...options // Apply custom options here
        });

        window.VerovioToolkit.loadData(data);
        const meiData = window.VerovioToolkit.getMEI({ noLayout: false });
        window.VerovioToolkit.loadData(meiData);

        const uniqueId = generateUniqueId();
        sourceMap[uniqueId] = filePath;

        currentElements = { page: 1, uniqueId };
        renderPage(uniqueId);

        const container = createContainer(uniqueId);
        el.appendChild(container);
    } catch (error) {
        const errorMsg = document.createElement('p');
        errorMsg.textContent = `Error rendering data: ${error.message}`;
        el.appendChild(errorMsg);
    }
}

function extractFilePathAndOptions(source: string): { filePath: string, options: Record<string, any> } {
    const lines = source.split('\n');
    const filePath = lines[0].trim();
    const options: Record<string, any> = {};

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [key, value] = line.split(':').map(part => part.trim());
            if (key && value) {
                options[key] = parseOptionValue(value);
            }
        }
    }

    return { filePath, options };
}

function parseOptionValue(value: string): any {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value))) return Number(value);
    return value;
}


function renderPage(uniqueId: string) {
    if (currentElements.page !== currentPage) {
        currentPage = currentElements.page;
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        updateContainerSVG(uniqueId, svg);
    }
}

async function fetchFileData(path: string): Promise<string> {
    if (isValidUrl(path)) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        return await response.text();
    }

    const file = app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return await app.vault.read(file);
}

function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function generateUniqueId(): string {
    return `rendering-${performance.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createContainer(uniqueId: string): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "verovio-container";
    container.setAttribute("data-unique-id", uniqueId);

    const svg = window.VerovioToolkit.renderToSVG(currentPage);
    const svgWrapper = document.createElement('div');
    svgWrapper.appendChild(stringToElement(svg));
    container.appendChild(svgWrapper);

    const toolbar = createToolbar(uniqueId);
    container.appendChild(toolbar);

    return container;
}

function updateContainerSVG(uniqueId: string, svg: string) {
    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    const svgWrapper = container.querySelector('div');
    svgWrapper?.replaceChildren(stringToElement(svg));

    const toolbar = container.querySelector('.verovio-toolbar');
    if (toolbar) container.appendChild(toolbar);
}

function createToolbar(uniqueId: string): HTMLDivElement {
    const toolbar = document.createElement("div");
    toolbar.className = "verovio-toolbar";

    toolbar.appendChild(createButton(playIcon(), () => playMIDI(uniqueId)));
    toolbar.appendChild(createButton(stopIcon(), stopMIDI));
    toolbar.appendChild(createButton(downloadIcon(), downloadSVG));
    toolbar.appendChild(createButton(openIcon(), () => openFileExternally(uniqueId)));

    return toolbar;
}

function openIcon(): string {
    return `&#128194;`; // Unicode for a folder icon (📂)
}

async function openFileExternally(uniqueId: string) {
    try {
        const source = findSourcePathByUniqueId(uniqueId);
        if (!source) throw new Error(`Source path not found for uniqueId: ${uniqueId}`);

        const file = app.vault.getAbstractFileByPath(source.trim());
        if (!file || !(file instanceof TFile)) throw new Error(`File not found or not a valid file: ${source}`);

        const absoluteFilePath = app.vault.adapter.getFullPath(file.path);
        console.log(`Trying to open file at: ${absoluteFilePath}`);

        const platform = os.platform();
        let command = '';

        switch (platform) {
            case 'win32': command = `start "" "${absoluteFilePath}"`; break;
            case 'darwin': command = `open "${absoluteFilePath}"`; break;
            case 'linux': command = `xdg-open "${absoluteFilePath}"`; break;
            default: throw new Error('Unsupported OS');
        }

        console.log(`Executing command: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) console.error(`Execution error: ${error.message}`);
            if (stderr) console.error(`Execution stderr: ${stderr}`);
            console.log(`Execution stdout: ${stdout}`);
        });
    } catch (error) {
        console.error(`Error opening file externally: ${error.message}`);
    }
}

function createButton(iconSvg: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.innerHTML = iconSvg;
    button.onclick = onClick;
    return button;
}

function playIcon(): string {
    return `&#9658;`; // Unicode for play button (▶)
}

function stopIcon(): string {
    return `&#9632;`; // Unicode for stop button (■)
}

function downloadIcon(): string {
    return `&#8681;`; // Unicode for download arrow (⬇)
}

async function playMIDI(uniqueId: string) {
    try {
        await reloadVerovioData(uniqueId);

        const midiData = window.VerovioToolkit.renderToMIDI();
        if (!midiData) throw new Error('Failed to generate MIDI data.');

        const midiDataUrl = 'data:audio/midi;base64,' + midiData;
        MIDI.Player.stop();
        MIDI.Player.BPM = null;
        MIDI.Player.loadFile(midiDataUrl, () => {
            MIDI.Player.start();
            attachMIDIHighlighting(uniqueId);
        });
    } catch (error) {
        console.error(`Error playing MIDI for ${uniqueId}: ${error.message}`);
    }
}


async function reloadVerovioData(uniqueId: string) {
    try {
        const source = findSourcePathByUniqueId(uniqueId);
        if (!source) throw new Error(`Source path not found for uniqueId: ${uniqueId}`);

        // Extract file path and options just like in the initial rendering
        const { filePath, options } = extractFilePathAndOptions(source);

        const data = await fetchFileData(filePath.trim());
        if (!data) throw new Error('Failed to fetch file data.');

        window.VerovioToolkit.setOptions({
            ...this.settings,
            ...options // Apply custom options here
        });

        // Preserve the current page number before reloading the data
        const currentPageBeforeReload = currentPage;

        window.VerovioToolkit.loadData(data);
        const meiDataWithLayout = window.VerovioToolkit.getMEI({ noLayout: false });
        if (!meiDataWithLayout) throw new Error('Failed to retrieve MEI data with layout.');
        

        window.VerovioToolkit.loadData(meiDataWithLayout);

        // Render the preserved page instead of starting from page 1
        currentPage = currentPageBeforeReload;
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        if (!svg) throw new Error('Failed to render SVG.');

        updateContainerSVG(uniqueId, svg);
        console.log('Verovio data reloaded successfully.');
    } catch (error) {
        console.error(`Error reloading Verovio data: ${error.message}`, error);
    }
}



function findSourcePathByUniqueId(uniqueId: string): string | undefined {
    return sourceMap[uniqueId];
}

function stopMIDI() {
    MIDI.Player.stop();
}

async function downloadSVG(event: MouseEvent) {
    const container = (event.target as HTMLElement).closest(".verovio-container");
    if (!container) return;

    const svgElement = container.querySelector("svg");
    if (!svgElement) return;

    const blob = new Blob([new XMLSerializer().serializeToString(svgElement)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "score.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function attachMIDIHighlighting(uniqueId: string) {
    MIDI.Player.addListener((data: any) => {
        if (data.message === 144) { // Note On message
            highlightNoteHandler(data, uniqueId);
        } else if (data.message === 128) { // Note Off message
            dehighlightNoteHandler(data, uniqueId);
        }
    });
}

function highlightNoteHandler(data: any, uniqueId: string) {
    if (!window.VerovioToolkit) return;

    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    const currentTimeMillis = MIDI.Player.currentTime + 33.5; // Modify offset if necessary
    console.log(`Checking for notes at time: ${currentTimeMillis}`);

    const elements = window.VerovioToolkit.getElementsAtTime(currentTimeMillis);

    if (elements?.notes && elements.notes.length > 0) {
        console.log(`Notes found at time ${currentTimeMillis}:`, elements.notes);
        elements.notes.forEach(noteId => {
            const noteElement = container.querySelector(`g.note#${noteId}`);
            if (noteElement) {
                console.log(`Highlighting note ${noteId} at time ${currentTimeMillis}`);
                noteElement.classList.add("playing");
            } else {
                console.warn(`Note element with ID ${noteId} not found in the container.`);
            }
        });
    } else {
        console.log(`No notes found at time ${currentTimeMillis}.`);
    }
}


function dehighlightNoteHandler(data: any, uniqueId: string) {
    if (!window.VerovioToolkit) return;

    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    const currentTimeMillis = MIDI.Player.currentTime - 0.5; // Modify offset if necessary
    const elements = window.VerovioToolkit.getElementsAtTime(currentTimeMillis);

    if (elements?.notes) {
        elements.notes.forEach(noteId => {
            const noteElement = container.querySelector(`g.note#${noteId}`);
            if (noteElement) {
                noteElement.classList.remove("playing");
            }
        });
    }
}

function stringToElement(svgString: string): HTMLElement {
    const template = document.createElement('template');
    template.innerHTML = svgString.trim();
    return template.content.firstChild as HTMLElement;
}

export { processVerovioCodeBlocks };
