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
    loadPlugin?: (options: { instrument?: string | string[]; instruments?: string | string[]; onsuccess?: () => void; onerror?: (error: unknown) => void }) => void;
    noteOn?: (channel: number, note: number, velocity: number, delay?: number) => unknown;
    noteOff?: (channel: number, note: number, delay?: number) => unknown;
    programChange?: (channel: number, program: number, delay?: number) => void;
    setVolume?: (channel: number, volume: number, delay?: number) => void;
  };
  export default MIDI;
}
