// A two-note chime, synthesised rather than shipped.
//
// No audio file: a driver's data plan shouldn't pay for a 40KB mp3, and an
// oscillator is exact. Two soft sine tones a fifth apart with a quick decay
// — audible over road noise, not startling in a quiet car.
//
// Browsers refuse to start audio without a user gesture, and on iOS the
// context begins suspended. prime() is called from the online switch —
// the one deliberate tap a driver always makes before work can arrive —
// so by the time an offer lands, playing is already allowed.

let ctx: AudioContext | null = null;

type Ctor = typeof AudioContext;
function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call from a real user gesture so later chimes are permitted to sound. */
export function primeAudio(): void {
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    ctx = ctx ?? new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null; // audio is a courtesy, never a requirement
  }
}

function note(at: number, hz: number, seconds: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  // a soft attack and an exponential tail — no click at either end
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/** Sound the offer chime. Silently does nothing if audio isn't allowed. */
export async function chime(): Promise<void> {
  const Ctor = audioCtor();
  if (!Ctor) return;
  try {
    ctx = ctx ?? new Ctor();
    if (ctx.state === "suspended") await ctx.resume();
    if (ctx.state !== "running") return; // still blocked — stay quiet
    const t = ctx.currentTime;
    note(t, 880, 0.34);          // A5
    note(t + 0.16, 1318.5, 0.42); // E6 — a fifth above
  } catch {
    /* a chime that can't play is not an error worth surfacing */
  }
}
