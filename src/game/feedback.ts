/**
 * The reward for landing a sign: a short chime and a green flash.
 *
 * The chime is synthesized rather than loaded, so the game ships no audio
 * files and nothing has to download before the first correct sign. Browsers
 * refuse to start audio before the player interacts with the page, so the
 * context is created on the first click (`unlock`) and every later failure is
 * swallowed — a silent game still plays.
 */
let context: AudioContext | undefined;
let muted = false;

type WithWebkit = typeof globalThis & { webkitAudioContext?: typeof AudioContext };

/** Call from a click handler: browsers only allow audio to start from a gesture. */
export function unlockAudio(): void {
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as WithWebkit).webkitAudioContext;
      if (!Ctor) return;
      context = new Ctor();
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = undefined;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

/** A rising two-note chime, about a quarter of a second long. */
export function playCorrectChime(): void {
  if (muted || !context || context.state !== 'running') return;
  try {
    const start = context.currentTime;
    // E5 then B5: a rising fifth reads as "yes" without being shrill.
    for (const [index, frequency] of [659.25, 987.77].entries()) {
      const at = start + index * 0.09;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.22, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.24);
    }
  } catch {
    // Audio is a nicety; never let it interrupt a round.
  }
}

/** A lower, flatter tone for a miss. */
export function playMissTone(): void {
  if (muted || !context || context.state !== 'running') return;
  try {
    const at = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(220, at);
    oscillator.frequency.exponentialRampToValueAtTime(165, at + 0.18);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.14, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.22);
  } catch {
    // As above.
  }
}

export function closeAudio(): void {
  try {
    void context?.close();
  } catch {
    // Already gone.
  }
  context = undefined;
}
