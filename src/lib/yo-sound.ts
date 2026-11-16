// The Yo sound (public/yo.mp3, the app's yo.caf), for the YoPhone and the big "Yo" on the home page.
//
// It plays through Web Audio once decoded; until then (or without Web Audio) through a small pool of <audio>
// elements. Nothing plays before the visitor has tapped something that makes a Yo: `heard()` says whether they have.

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let loading = false;
const pool: HTMLAudioElement[] = [];
let next = 0;
let tapped = false;
let playing: AudioBufferSourceNode | HTMLAudioElement | null = null;

function load() {
  if (loading) return;
  loading = true;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  fetch('/yo.mp3')
    .then((r) => r.arrayBuffer())
    .then((a) => new Promise<AudioBuffer>((ok, fail) => ctx!.decodeAudioData(a, ok, fail)))
    .then((b) => { buffer = b; })
    .catch(() => { ctx = null; });
}

// Ready on the first touch anywhere (a user gesture), so the first tap on a name already plays through Web Audio.
if (typeof window !== 'undefined') addEventListener('pointerdown', load, { once: true, passive: true });

/** Whether the visitor has made a Yo yet (only then may a Yo arriving by itself make a sound). */
export const heard = () => tapped;

/**
 * The Yo sound from the start. A Yo you send cuts off the one still playing, as in the app ("tapped fast, their
 * sounds cut each other off"); one arriving plays over it (`overlap`), as the app's Inbox does.
 */
export function playYo({ overlap = false, user = true } = {}) {
  if (user) tapped = true;
  load();
  if (!overlap) {
    if (playing instanceof AudioBufferSourceNode) { try { playing.stop(); } catch {} }
    else if (playing) playing.pause();
  }
  if (ctx && buffer) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    playing = source;
    return;
  }
  if (!pool.length) for (let i = 0; i < 4; i++) { const a = new Audio('/yo.mp3'); a.preload = 'auto'; pool.push(a); }
  const a = pool.find((p) => p.paused) ?? pool[next++ % pool.length];
  try { a.currentTime = 0; } catch {}
  a.play().catch(() => {});
  playing = a;
}

let shutterNoise: AudioBuffer | null = null;

/**
 * A camera's shutter, made here with Web Audio (no file): two short clicks 40 ms apart, each a burst of white noise
 * through a band-pass filter with a quick attack and decay, quietly under the Yo sound. It plays only from a tap (a
 * user gesture), on the same AudioContext as the Yo sound; without Web Audio it stays silent.
 */
export function playShutter() {
  tapped = true;
  load();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!shutterNoise) {
    // 30 ms of white noise, made once and used for every click.
    shutterNoise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.03), ctx.sampleRate);
    const samples = shutterNoise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  // The first click (the shutter opening) is brighter and a little louder than the second (it closing).
  [
    { delay: 0, frequency: 3800, peak: 0.22 },
    { delay: 0.04, frequency: 2600, peak: 0.16 },
  ].forEach(({ delay, frequency, peak }) => {
    const at = ctx!.currentTime + delay;
    const source = ctx!.createBufferSource();
    source.buffer = shutterNoise;
    const filter = ctx!.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.9;
    const gain = ctx!.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
    source.connect(filter).connect(gain).connect(ctx!.destination);
    source.start(at);
    source.stop(at + 0.03);
  });
}
