declare module 'lz-midi' {
  interface MidiMessage {
    message: number;
    note: string;
  }

  interface MidiAnimationFrame {
    now: number;
  }

  interface MidiPlayer {
    BPM: number | null;
    stop(): void;
    clearListeners?: () => void;
    addListener(cb: (data: MidiMessage) => void): void;
    loadFile(dataUri: string, cb: () => void): void;
    start(): void;
    setAnimation?: (cb: (frame: MidiAnimationFrame) => void) => void;
  }

  const MIDI: {
    Player: MidiPlayer;
  };
  export default MIDI;
}
