export function addVerovioStyles() {
  const style = document.createElement("style");
  style.textContent = `
      .verovio-container {
          max-width: 100%;
          margin: 0 auto;
          padding: 0;
          position: relative;
      }
      .verovio-container svg {
          max-width: 100%;
          height: auto;
      }
      .verovio-toolbar {
          position: absolute;
          top: 10px;
          right: 10px;
          display: none;
          background: rgba(255, 255, 255, 0.8);
          border: 1px solid #ccc;
          padding: 5px;
          border-radius: 3px;
          z-index: 10;
      }
      .verovio-container:hover .verovio-toolbar {
          display: flex;
          gap: 5px;
      }
      .verovio-toolbar button {
          background: none;
          border: none;
          cursor: pointer;
      }
      .verovio-toolbar button svg {
          width: 24px;
          height: 24px;
          fill: black;
      }
      .playing {
          fill: crimson;
      }
  `;
  document.head.appendChild(style);
}
