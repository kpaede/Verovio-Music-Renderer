    import VerovioMusicRenderer from './main';
    import MIDI from 'lz-midi';

    // Object to store the unique MIDI data by ID
    const midiDataMap: Record<string, string> = {};
    let currentPage = 1; // Initialize with the default or current page number
    let currentElements: { page: number } = { page: 1 }; // Initialize with a default page

    async function processVerovioCodeBlocks(this: VerovioMusicRenderer, source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const startTime = performance.now();
    if (!window.VerovioToolkit) {
        console.error("Verovio is not yet loaded or failed to load.");
        return;
    }

    const settings = this.settings;

    try {
        console.log(`[${new Date().toISOString()}] Fetching file data for source: ${source.trim()}`);
        const data = await fetchFileData(source.trim());
        console.log(`[${new Date().toISOString()}] File data fetched successfully. Data size: ${data.length} bytes`);

        window.VerovioToolkit.setOptions({
        scale: settings.scale,
        adjustPageHeight: settings.adjustPageHeight,
        adjustPageWidth: settings.adjustPageWidth,
        breaks: settings.breaks,
        pageWidth: settings.pageWidth,
        midiTempoAdjustment: settings.midiTempoAdjustment,
        font: settings.font
        });

        console.log(`[${new Date().toISOString()}] Verovio options set:`, settings);

        window.VerovioToolkit.loadData(data);
        const meiData = window.VerovioToolkit.getMEI({ noLayout: false });
        console.log(`[${new Date().toISOString()}] MEI data generated successfully. Data size: ${meiData.length} bytes`);

        window.VerovioToolkit.loadData(meiData);

        // Create a unique ID for this rendering
        const uniqueId = `rendering-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        console.log(`[${new Date().toISOString()}] Unique ID for rendering created: ${uniqueId}`);

        // Generate MIDI data and store it with the unique ID
        const base64midi = window.VerovioToolkit.renderToMIDI();
        midiDataMap[uniqueId] = 'data:audio/midi;base64,' + base64midi;
        console.log(`[${new Date().toISOString()}] MIDI data generated and stored. Data size: ${base64midi.length} bytes`);

        // Initial render of the first page
        currentElements.page = 1;
        checkAndRenderPage();

        const container = document.createElement("div");
        container.className = "verovio-container";
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        console.log(`[${new Date().toISOString()}] SVG rendered for page ${currentPage}. SVG size: ${svg.length} bytes`);

        container.innerHTML = svg;
        const toolbar = createToolbar(uniqueId);
        container.appendChild(toolbar);
        el.appendChild(container);

        console.log(`[${new Date().toISOString()}] Rendering completed in ${(performance.now() - startTime).toFixed(2)} ms`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error rendering data:`, error, error.stack);
        el.innerHTML = `<p>Error rendering data: ${error.message}</p>`;
    }
    }

    function checkAndRenderPage() {
    console.log(`[${new Date().toISOString()}] Checking page. Current page: ${currentPage}, Target page: ${currentElements.page}`);

    if (currentElements.page <= 0) {
        console.error(`[${new Date().toISOString()}] Error: Page number is invalid. Stack trace:`, new Error().stack);
        return;
    }

    if (currentElements.page !== currentPage) {
        console.log(`[${new Date().toISOString()}] Page number mismatch. Updating to page ${currentElements.page}`);
        currentPage = currentElements.page;
        const svg = window.VerovioToolkit.renderToSVG(currentPage);
        document.getElementById("notation")!.innerHTML = svg;
        console.log(`[${new Date().toISOString()}] Page ${currentPage} rendered successfully.`);
    } else {
        console.log(`[${new Date().toISOString()}] Already on the correct page: ${currentPage}`);
    }
    }

    async function fetchFileData(path: string): Promise<string> {
    try {
        let data = '';
        if (isValidUrl(path)) {
        console.log(`[${new Date().toISOString()}] Fetching data from URL: ${path}`);
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
        data = await response.text();
        } else {
        console.log(`[${new Date().toISOString()}] Fetching data from local file: ${path}`);
        const file = app.vault.getAbstractFileByPath(path);
        if (!file) throw new Error(`File not found: ${path}`);
        data = await app.vault.read(file);
        }
        console.log(`[${new Date().toISOString()}] Data fetched successfully. Data size: ${data.length} bytes`);
        return data;
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to fetch file data:`, error, error.stack);
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
    console.log(`[${new Date().toISOString()}] Creating toolbar for unique ID: ${uniqueId}`);
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
    console.log(`[${new Date().toISOString()}] Creating button with icon:`, iconSvg);
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
    console.log(`[${new Date().toISOString()}] Attempting to play MIDI for unique ID: ${uniqueId}`);
    const midiDataUrl = midiDataMap[uniqueId];
    if (midiDataUrl) {
        try {
        console.log(`[${new Date().toISOString()}] Stopping any previous MIDI playback.`);
        MIDI.Player.stop();

        console.log(`[${new Date().toISOString()}] Loading and playing MIDI data for ID: ${uniqueId}`);
        MIDI.Player.loadFile(midiDataUrl, () => {
            console.log(`[${new Date().toISOString()}] MIDI file loaded successfully. Starting playback.`);
            MIDI.Player.start();

            // Debug: Log state before attaching highlighting
            console.log(`[${new Date().toISOString()}] Current Verovio toolkit state before highlighting attachment:`, window.VerovioToolkit);
            attachMIDIHighlighting();
        });
        } catch (error) {
        console.error(`[${new Date().toISOString()}] Error playing MIDI for ${uniqueId}:`, error, error.stack);
        }
    } else {
        console.error(`[${new Date().toISOString()}] MIDI data for ${uniqueId} not found.`);
    }
    }

    function stopMIDI() {
    console.log(`[${new Date().toISOString()}] Stopping MIDI playback.`);
    MIDI.Player.stop();
    }

    async function downloadSVG(event: MouseEvent) {
    const container = (event.target as HTMLElement).closest(".verovio-container");
    if (!container) {
        console.error(`[${new Date().toISOString()}] Container element not found. Stack trace:`, new Error().stack);
        return;
    }
    const svgElement = container.querySelector("svg");
    if (!svgElement) {
        console.error(`[${new Date().toISOString()}] SVG element not found. Stack trace:`, new Error().stack);
        return;
    }
    console.log(`[${new Date().toISOString()}] Preparing to download SVG. Size: ${svgElement.outerHTML.length} bytes`);
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
    console.log(`[${new Date().toISOString()}] SVG download initiated.`);
    }

    // Custom MIDI Event Handler that includes `data.now`
    const midiHighlightingHandler = function (data: any) {
        console.log(`[${new Date().toISOString()}] MIDI highlighting handler triggered. Data:`, data);
        try {
            if (!window.VerovioToolkit) {
                console.error(`[${new Date().toISOString()}] VerovioToolkit is not available. Stack trace:`, new Error().stack);
                return;
            }

            // Clear previous highlights
            let playingNotes = document.querySelectorAll('g.note.playing');
            console.log(`[${new Date().toISOString()}] Clearing previous highlights. Found ${playingNotes.length} notes.`);
            playingNotes.forEach(note => note.classList.remove("playing"));

            // Retrieve the current time with a small buffer
            const timeBuffer = 10; // e.g., 10 milliseconds
            const currentTimeMillis = MIDI.Player.currentTime + timeBuffer;
            console.log(`[${new Date().toISOString()}] Current playback time in ms (with buffer): ${currentTimeMillis}`);

            // Retrieve the elements currently being played
            const elements = window.VerovioToolkit.getElementsAtTime(currentTimeMillis);
            console.log(`[${new Date().toISOString()}] Elements retrieved at current time:`, elements);

            // Check and process elements based on expected format
            if (elements && Array.isArray(elements.notes)) {
                if (elements.notes.length === 0) {
                    console.warn(`[${new Date().toISOString()}] No notes found at time: ${currentTimeMillis}`);
                } else {
                    elements.notes.forEach(noteId => {
                        console.log(`[${new Date().toISOString()}] Processing note with ID: ${noteId}`);
                        const noteElement = document.querySelector(`g.note#${noteId}`);
                        if (noteElement) {
                            noteElement.classList.add("playing");
                            console.log(`[${new Date().toISOString()}] Highlighted note element with ID: ${noteId}`);
                        } else {
                            console.warn(`[${new Date().toISOString()}] Note element not found for ID: ${noteId}`);
                        }
                    });
                }
            } else {
                console.error(`[${new Date().toISOString()}] Unexpected data format from getElementsAtTime:`, elements);
            }

            // Check and render the correct page
            checkAndRenderPage();

        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error in midiHighlightingHandler:`, error, error.stack);
        }
    };


    function attachMIDIHighlighting() {
        console.log(`[${new Date().toISOString()}] Attaching MIDI highlighting handler.`);
        try {
            if (!MIDI.Player) {
                console.error(`[${new Date().toISOString()}] MIDI.Player is not available. Stack trace:`, new Error().stack);
                return;
            }

            // Attach the custom MIDI event handler to the MIDI Player's event listener
            MIDI.Player.addListener((data: any) => {
                if (data.message === 144) { // 144 corresponds to noteOn
                    console.log(`[${new Date().toISOString()}] MIDI event 'noteOn' triggered. Data:`, data);
                    midiHighlightingHandler(data);
                }
            });

            console.log(`[${new Date().toISOString()}] MIDI highlighting handler attached successfully.`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error attaching MIDI highlighting handler:`, error, error.stack);
        }
    }

    export { processVerovioCodeBlocks };
