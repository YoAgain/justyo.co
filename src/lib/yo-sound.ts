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
