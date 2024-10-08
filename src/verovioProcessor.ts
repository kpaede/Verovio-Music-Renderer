import VerovioMusicRenderer from '../main';
import MIDI from 'lz-midi';
import { TFile, Platform, Notice, requestUrl, setIcon, sanitizeHTMLToDom } from 'obsidian';


// Maps for storing source paths and custom options
const sourceMap: Record<string, string> = {};
const optionsMap: Record<string, Record<string, any>> = {};
const measureRangeMap: Record<string, string> = {};
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
        // Extract the file path, options, and measureRange
        const { filePath, options, measureRange } = extractFilePathAndOptions(source.trim());

        // Fetch the file data
        const data = await fetchFileData(filePath);

        // Backup the current global settings to restore them later
        const originalSettings = { ...this.settings };

        // Apply custom options for this rendering
        const appliedOptions = {
            ...this.settings,   // Default settings
            ...options          // Override with custom options from code block
        };
        window.VerovioToolkit.setOptions(appliedOptions);

        window.VerovioToolkit.loadData(data);

        // Apply measureRange using the select method
        if (measureRange) {
            const success = window.VerovioToolkit.select({ measureRange });
            if (!success) {
                throw new Error(`Failed to apply measureRange: ${measureRange}`);
            }
        }

        const meiData = window.VerovioToolkit.getMEI({ noLayout: false });
        window.VerovioToolkit.loadData(meiData);

        const uniqueId = generateUniqueId();
        sourceMap[uniqueId] = filePath;
        optionsMap[uniqueId] = appliedOptions; // Store custom options for later use
        measureRangeMap[uniqueId] = measureRange; // Store measureRange for later use

        currentElements = { page: 1, uniqueId };
        renderPage(uniqueId);

        const container = createContainer(uniqueId);
        el.appendChild(container);

        // Restore the original settings after rendering
        window.VerovioToolkit.setOptions(originalSettings);

    } catch (error) {
        const errorMsg = document.createElement('p');
        errorMsg.textContent = `Error rendering data: ${error.message}`;
        el.appendChild(errorMsg);
    }
}

async function reloadVerovioData(uniqueId: string) {
    try {
        const source = findSourcePathByUniqueId(uniqueId);
        const options = optionsMap[uniqueId];  // Retrieve custom options
        const measureRange = measureRangeMap[uniqueId];  // Retrieve measureRange

        if (!source || !options) throw new Error(`Source path or options not found for uniqueId: ${uniqueId}`);

        const data = await fetchFileData(source.trim());
        if (!data) throw new Error('Failed to fetch file data.');

        // Apply custom options for this reload
        window.VerovioToolkit.setOptions(options);

        // Preserve the current page number before reloading the data
        const currentPageBeforeReload = currentPage;

        window.VerovioToolkit.loadData(data);

        // Reapply measureRange
        if (measureRange) {
            const success = window.VerovioToolkit.select({ measureRange });
            if (!success) {
                throw new Error(`Failed to reapply measureRange: ${measureRange}`);
            }
        }

        const meiDataWithLayout = window.VerovioToolkit.getMEI({ noLayout: false });
        if (!meiDataWithLayout) throw new Error('Failed to retrieve MEI data with layout.');
        window.VerovioToolkit.loadData(meiDataWithLayout);

        // Render the preserved page instead of starting from page 1
        currentPage = currentPageBeforeReload;
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        if (!svg) throw new Error('Failed to render SVG.');
        updateContainerSVG(uniqueId, svg);

    } catch (error) {
        console.error(`Error reloading Verovio data: ${error.message}`);
    }
}

function extractFilePathAndOptions(source: string): { filePath: string, options: Record<string, any>, measureRange: string | undefined } {
    const lines = source.split('\n');
    const filePath = lines[0].trim();
    const options: Record<string, any> = {};
    let measureRange: string | undefined;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const [key, value] = line.split(':').map(part => part.trim());
            if (key && value) {
                if (key === 'measureRange') {
                    measureRange = value;
                } else {
                    options[key] = parseOptionValue(value);
                }
            }
        }
    }

    return { filePath, options, measureRange };
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
        try {
            const response = await requestUrl({ url: path });
            if (response.status !== 200) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            return response.text;
        } catch (error) {
            throw new Error(`Failed to fetch file: ${error.message}`);
        }
    }

    const file = this.app.vault.getAbstractFileByPath(path);

    // Check if the file exists and is a valid TFile
    if (!file || !(file instanceof TFile)) {
        throw new Error(`File not found or not a valid file: ${path}`);
    }

    // If it's a valid file, proceed with reading the file
    return await this.app.vault.read(file);
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

    const svgString = window.VerovioToolkit.renderToSVG(currentPage);

    // Parse the SVG string and manually create SVG nodes
    const svgWrapper = document.createElement('div');
    const svgElement = createSvgElementFromString(svgString);
    if (svgElement) {
        svgWrapper.appendChild(svgElement);
    }

    container.appendChild(svgWrapper);

    const toolbar = createToolbar(uniqueId);
    container.appendChild(toolbar);

    return container;
}
function createSvgElementFromString(svgString: string): SVGElement | null {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, "image/svg+xml");

    // Ensure the parsed document is actually an SVG
    const svgElement = svgDoc.querySelector('svg');
    if (!svgElement) {
        console.error('Invalid SVG string');
        return null;
    }

    // Create the main SVG element using the SVG namespace
    const svgNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    // Manually copy attributes
    Array.from(svgElement.attributes).forEach(attr => {
        svgNode.setAttribute(attr.name, attr.value);
    });

    // Manually append child elements
    svgElement.childNodes.forEach(child => {
        svgNode.appendChild(child.cloneNode(true));
    });

    return svgNode;
}




function updateContainerSVG(uniqueId: string, svg: string) {
    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    const svgWrapper = container.querySelector('div');
    if (!svgWrapper) return;

    // Clear the current content safely
    svgWrapper.textContent = '';

    // Create SVG element from string and append it
    const svgElement = createSvgElementFromString(svg);
    if (svgElement) {
        svgWrapper.appendChild(svgElement);
    }
}




function createToolbar(uniqueId: string): HTMLDivElement {
    const toolbar = document.createElement("div");
    toolbar.className = "verovio-toolbar";

    toolbar.appendChild(createButton("play", () => playMIDI(uniqueId)));         // Play icon
    toolbar.appendChild(createButton("square", stopMIDI));                       // Stop icon
    toolbar.appendChild(createButton("image-down", downloadSVG));                // Download SVG icon
    toolbar.appendChild(createButton("external-link", () => openFileExternally(uniqueId)));  // Open external file icon

    return toolbar;
}

async function openFileExternally(uniqueId: string) {
    const source = findSourcePathByUniqueId(uniqueId);
    if (!source) throw new Error(`Source path not found for uniqueId: ${uniqueId}`);

    const file = this.app.vault.getAbstractFileByPath(source.trim());
    if (!file || !(file instanceof TFile)) throw new Error(`File not found or not a valid file: ${source}`);

    const absoluteFilePath = this.app.vault.adapter.getFullPath(file.path);

    if (Platform.isDesktop) {
        try {
            const { shell } = require('electron');
            shell.openPath(absoluteFilePath);  // Open the file with the default application
        } catch (error) {
            console.error(`Error opening file externally: ${error.message}`);
        }
    } else {
        // Show a notice on mobile, since this functionality is not supported
        new Notice("Opening files externally is not supported on mobile.");
    }
}






function createButton(iconId: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    setIcon(button, iconId);  // Set the icon using Obsidian's setIcon function
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

function findSourcePathByUniqueId(uniqueId: string): string | undefined {
    return sourceMap[uniqueId];
}

function stopMIDI() {
    MIDI.Player.stop();
}

async function downloadSVG(event: MouseEvent) {
    if (Platform.isMobile) {
        // Show a notice on mobile since file download is not supported
        new Notice("Downloading files is not supported on mobile.");
        return;
    }

    // Desktop download logic
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

    const elements = window.VerovioToolkit.getElementsAtTime(currentTimeMillis);

    if (elements?.notes && elements.notes.length > 0) {
        elements.notes.forEach(noteId => {
            const noteElement = container.querySelector(`g.note#${noteId}`);
            if (noteElement) {
                noteElement.classList.add("playing");
            }
        });
    }
}

function dehighlightNoteHandler(data: any, uniqueId: string) {
    if (!window.VerovioToolkit) return;

    const container = document.querySelector(`.verovio-container[data-unique-id="${uniqueId}"]`);
    if (!container) return;

    const currentTimeMillis = MIDI.Player.currentTime - 0.5; // Modify offset if necessary!
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


export { processVerovioCodeBlocks };
