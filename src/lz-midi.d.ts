declare module 'lz-midi' {
  interface MidiMessage {
    message: number;
    note: string;
  }

  interface MidiAnimationFrame {
    now: number;
    end?: number;
  }

  interface MidiPlayer {
    BPM: number | null;
    currentTime: number;
    endTime: number;
    stop(): void;
    clearListeners?: () => void;
    addListener(cb: (data: MidiMessage) => void): void;
    loadFile(dataUri: string, cb: () => void): void;
    start(): void;
    setAnimation?: (cb: (frame: MidiAnimationFrame) => void) => void;
  }

  interface MidiChannel {
    instrument: number;
  }

  const MIDI: {
    Player: MidiPlayer;
    channels?: Record<number, MidiChannel>;
  };
  export default MIDI;
}
