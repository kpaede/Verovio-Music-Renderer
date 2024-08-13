import VerovioMusicRenderer from './main';
import MIDI from 'lz-midi';
import { VerovioPluginSettings, DEFAULT_SETTINGS } from './settings';
import { exec } from 'child_process';
import { TFile } from 'obsidian';
import * as os from 'os';  // Import the os module to detect the operating system



// Maps for storing source paths
const sourceMap: Record<string, string> = {}; 

let currentPage = 1;
let currentElements: { page: number, uniqueId: string } = { page: 1, uniqueId: '' };

async function processVerovioCodeBlocks(this: VerovioMusicRenderer, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    if (!window.VerovioToolkit) {
        el.innerHTML = `<p>Verovio is not yet loaded or failed to load.</p>`;
        return;
    }

    try {
        const data = await fetchFileData(source.trim());

        // Set Verovio options
        window.VerovioToolkit.setOptions(this.settings);

        // Load and render data
        window.VerovioToolkit.loadData(data);
        const meiData = window.VerovioToolkit.getMEI({ noLayout: false });
        window.VerovioToolkit.loadData(meiData);

        const uniqueId = generateUniqueId();
        sourceMap[uniqueId] = source; // Store the source path with the uniqueId

        currentElements = { page: 1, uniqueId };
        renderPage(uniqueId);

        const container = createContainer(uniqueId);
        el.appendChild(container);
    } catch (error) {
        el.innerHTML = `<p>Error rendering data: ${error.message}</p>`;
    }
}

function renderPage(uniqueId: string) {
    if (currentElements.page <= 0) return;

    if (currentElements.page !== currentPage) {
        currentPage = currentElements.page;
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        updateContainerSVG(uniqueId, svg);
    }
}

async function fetchFileData(path: string): Promise<string> {
    if (isValidUrl(path)) {
        // If the path is a valid URL, fetch the data from the URL
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        return await response.text();
    }

    // If the path is not a URL, assume it's a file path in Obsidian
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
    return `rendering-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createContainer(uniqueId: string): HTMLDivElement {
    const container = document.createElement("div");
    container.className = "verovio-container";
    container.setAttribute("data-unique-id", uniqueId);

    const svg = window.VerovioToolkit.renderToSVG(currentPage);
    container.innerHTML = svg;

    const toolbar = createToolbar(uniqueId);
    container.appendChild(toolbar);

    return container;
}

function updateContainerSVG(uniqueId: string, svg: string) {
    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    // Get the current toolbar
    const toolbar = container.querySelector('.verovio-toolbar');
    
    // Clear the container and set the new SVG
    container.innerHTML = svg;

    // Reattach the toolbar
    if (toolbar) {
        container.appendChild(toolbar);
    }
}

function createToolbar(uniqueId: string): HTMLDivElement {
    const toolbar = document.createElement("div");
    toolbar.className = "verovio-toolbar";

    toolbar.appendChild(createButton(playIcon(), () => playMIDI(uniqueId)));
    toolbar.appendChild(createButton(stopIcon(), stopMIDI));
    toolbar.appendChild(createButton(downloadIcon(), downloadSVG));
    toolbar.appendChild(createButton(openIcon(), () => openFileExternally(uniqueId))); // Add the new button here

    return toolbar;
}

function openIcon(): string {
    return `&#128194;`; // Unicode for a folder icon (📂)
}

async function openFileExternally(uniqueId: string) {
    try {
        const source = findSourcePathByUniqueId(uniqueId);
        if (!source) {
            throw new Error(`Source path not found for uniqueId: ${uniqueId}`);
        }

        const file = app.vault.getAbstractFileByPath(source.trim());
        if (!file || !(file instanceof TFile)) {
            throw new Error(`File not found or not a valid file: ${source}`);
        }

        // Get the absolute path of the file
        const absoluteFilePath = app.vault.adapter.getFullPath(file.path);
        console.log(`Trying to open file at: ${absoluteFilePath}`);

        const platform = os.platform();
        let command = '';

        if (platform === 'win32') {
            command = `start "" "${absoluteFilePath}"`;
        } else if (platform === 'darwin') {
            command = `open "${absoluteFilePath}"`;
        } else if (platform === 'linux') {
            command = `xdg-open "${absoluteFilePath}"`;
        } else {
            throw new Error('Unsupported OS');
        }

        console.log(`Executing command: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Execution error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Execution stderr: ${stderr}`);
            }
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
        // Reload Verovio data
        await reloadVerovioData(uniqueId);

        // Generate MIDI data URL directly
        const midiData = window.VerovioToolkit.renderToMIDI();
        if (!midiData) throw new Error('Failed to generate MIDI data.');

        const midiDataUrl = 'data:audio/midi;base64,' + midiData;

        // Stop any existing MIDI playback
        MIDI.Player.stop();

        // Load and start MIDI playback
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
        // Find the source path by uniqueId
        const source = findSourcePathByUniqueId(uniqueId);
        if (!source) {
            console.error(`Source path not found for uniqueId: ${uniqueId}`);
            throw new Error(`Source not found for uniqueId: ${uniqueId}`);
        }

        // Fetch the file data from the source
        const data = await fetchFileData(source.trim());
        if (!data) {
            console.error(`Failed to fetch data from source: ${source}`);
            throw new Error('Failed to fetch file data.');
        }

        // Load the data into Verovio
        window.VerovioToolkit.loadData(data);
        console.debug('Data loaded into Verovio.');

        // Retrieve MEI data with layout
        const meiDataWithLayout = window.VerovioToolkit.getMEI({ noLayout: false });
        if (!meiDataWithLayout) {
            console.error('Failed to retrieve MEI data with layout.');
            throw new Error('Failed to retrieve MEI data.');
        }
        window.VerovioToolkit.loadData(meiDataWithLayout);
        console.debug('MEI data with layout loaded into Verovio.');

        // Ensure the SVG rendering is done
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        if (!svg) {
            console.error(`Failed to render SVG for page ${currentPage}.`);
            throw new Error('Failed to render SVG.');
        }

        // Update the container with the rendered SVG
        updateContainerSVG(uniqueId, svg);

        // Notify user
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
        if (data.message === 144) {
            midiHighlightingHandler(data, uniqueId);
        }
    });
}

function midiHighlightingHandler(data: any, uniqueId: string) {
    if (!window.VerovioToolkit) return;

    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    container.querySelectorAll('g.note.playing').forEach(note => note.classList.remove("playing"));

    const currentTimeMillis = MIDI.Player.currentTime + 10;

    const elements = window.VerovioToolkit.getElementsAtTime(currentTimeMillis);

    if (elements?.notes) {
        elements.notes.forEach(noteId => {
            const noteElement = container.querySelector(`g.note#${noteId}`);
            if (noteElement) noteElement.classList.add("playing");
        });
    }

    renderPage(uniqueId);
}

export { processVerovioCodeBlocks };
