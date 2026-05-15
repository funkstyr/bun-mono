export const MUTE_STORAGE_KEY = "workout-timer:muted";

type AudioCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioCtor;
    webkitAudioContext?: AudioCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let ctx: AudioContext | null = null;
let muted: boolean = readPersistedMute();

function readPersistedMute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistMute(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, value ? "true" : "false");
  } catch {
    return;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  persistMute(value);
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

type ToneSpec = {
  frequency: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
};

function playTone(spec: ToneSpec, startOffsetSec: number = 0): void {
  const audio = ensureContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    void audio.resume().catch(() => {});
  }
  const startAt = audio.currentTime + startOffsetSec;
  const endAt = startAt + spec.durationMs / 1000;

  const osc = audio.createOscillator();
  osc.type = spec.type ?? "sine";
  osc.frequency.value = spec.frequency;

  const gainNode = audio.createGain();
  const peak = spec.gain ?? 0.18;
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(peak, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

  osc.connect(gainNode);
  gainNode.connect(audio.destination);
  osc.start(startAt);
  osc.stop(endAt + 0.02);
}

export function playTick(): void {
  if (muted) return;
  playTone({ frequency: 880, durationMs: 120, type: "sine", gain: 0.18 });
}

export function playPhaseChange(): void {
  if (muted) return;
  playTone({ frequency: 520, durationMs: 350, type: "triangle", gain: 0.22 });
}

export function playComplete(): void {
  if (muted) return;
  // Three-note ascending chord: C5, E5, G5
  playTone({ frequency: 523.25, durationMs: 600, type: "sine", gain: 0.2 }, 0);
  playTone({ frequency: 659.25, durationMs: 600, type: "sine", gain: 0.2 }, 0.12);
  playTone({ frequency: 783.99, durationMs: 800, type: "sine", gain: 0.2 }, 0.24);
}

// Test-only helper
export function __resetForTests(): void {
  ctx = null;
  muted = readPersistedMute();
}
