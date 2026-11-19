// What a YoPhone (YoPhone.astro beside this file) does, after the iOS app (yo/app/ios, FriendList.swift) and the
// core's list rules (yo/core/product: list.rs, line.rs):
//
// - Every bar stays one bar high and tells the newest: your own send or the Yos that came after it; when those are
//   over, its name again (never the older send).
// - A tap on a name: a click (the Yo sound is for Yos that arrive), and the bar says "Sent Yo!", then "Sent 2× Yo!",
//   "Sent 3× Yo!" (YoWords.sent); the count moves on at most every 0.2 s. 1.5 s after the last tap the bar says its
//   name again and goes on top (showSent, thenOnTop).
// - Every friend you Yo Yos back, 1.2 to 3 s after your Yo went, the replies to several friends staggered so they come
//   one after another: the Yo sound, the bar says "Yo from MIA" ("2× Yo from MIA") in the name's place, knocking as
//   it comes, and goes on top (receivedRow, rise). The newest wins: a Yo back replaces "Sent Yo!", a tap after it
//   says "Sent Yo!" again. A friend has one reply on its way at most. The Yo stands 3 s and fades out by 5 s
//   (yoSolidSeconds, yoSeconds); then the name again. While you are still tapping, the list does not move.
// - A group's bar ("#FAMILY", one "#"): a Yo goes to all its members and several Yo back. One sender: "Yo from MOM";
//   two or more: all of them, newest first, the count before the name, over two small lines in the same bar
//   ("2× Yo from TOM, 3× ANNA," / "4× PETER, LUKAS +2"): whole names only, what does not fit as "+N"
//   (line::sender_flow, line::flow_two_lines). A send or the name coming back starts the senders over.
// - Titles are never cut: the bar's size if they fit, else the small size, else two small lines in whole words
//   (line::wrap_two_lines); a single word too wide even then shrinks.
// - Going on top is a delete and an insert, as the app's list does it: the bar's place fades, the bars above slide
//   down one, the bar comes in from the top (transform and opacity only).
// - "+" opens the name field (addRow): what may be typed is the app's (username_canonical: Latin letters, accents
//   too, digits, "_" and emoji, a letter or emoji first, at most 16); Enter adds the name on top in the next colour
//   (Friends.add, nextColor); a name already there says "Already Added" on its bar; one under 3 characters the hub
//   would not know: "No Such User", and the field shakes. Escape or a tap elsewhere closes it. Nothing leaves the
//   page; a reload starts again.
// - Camera mode (the camera button): the bars see-through over a picture, a tap "sends a photo" (the shutter's click
//   when it takes one from the live picture, "Sent 📷", the undo ring for 2 s, then as a send); "✕" or Escape closes it. No camera is used. the "Yo" button: Invite, Add Group, Settings;
//   Add Group is the app's sheet (a name, the friends to pick, Create) and puts the group's bar on top.
// - autoplay: now and then Yos arrive by themselves while the phone is in view: a friend's, or a group's from several
//   members; silent until the visitor has made a Yo.
// - banner: an arriving Yo also drops the app's notification in ("Yo", "From MIA", "From LEO @ FAMILY") (the app shows none while open; for pages that want it).
// - Reduced motion: nothing arrives by itself and nothing slides; taps still work.
//
// Every phone on the page is its own: initYoPhones() starts each once; getYoPhone(el) returns one to drive it.

import { heard, playClick, playShutter, playYo } from '../../lib/yo-sound';

const SENT_SECONDS = 1.5;
const YO_SOLID_SECONDS = 3;
const YO_SECONDS = 5;
// A friend Yos back between these many seconds after your Yo went; replies to several friends come at least
// REPLY_GAP_SECONDS apart (and up to 0.7 s more).
const REPLY_SECONDS = [1.2, 3];
const REPLY_GAP_SECONDS = 0.6;
// A group's members Yo back about this far apart.
const BURST_GAP_SECONDS = 0.8;
const ROWS = ['#1ABC9C', '#2ECC71', '#3498DB', '#34495E', '#16A085', '#F1C40F', '#2980B9', '#8E44AD'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** How Yos are counted on a bar (YoWords): "Yo", "3× Yo"; sent: "Sent Yo!", "Sent 3× Yo!". */
const yoWords = (count: number) => (count <= 1 ? 'Yo' : `${count}× Yo`);
const sentWords = (count: number) => (count <= 1 ? 'Sent Yo!' : `Sent ${count}× Yo!`);

// ---- Usernames, as the core takes them (yo_core::handle: canonical, check_username_form, skeleton) ----

const graphemes = (s: string) =>
  'Segmenter' in Intl ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment) : [...s];
const isLetter = (g: string) => /^\p{Script=Latin}\p{M}*$/u.test(g);
const isEmoji = (g: string) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g);
const isOther = (g: string) => /^[0-9_]$/.test(g);

/** What may be typed: allowed characters only, a letter or emoji first, at most 16. */
function canonical(typed: string) {
  const kept: string[] = [];
  for (const g of graphemes(typed.normalize('NFC'))) {
    if (kept.length >= 16) break;
    if (isLetter(g) || isEmoji(g) || (kept.length > 0 && isOther(g))) kept.push(g);
  }
  return kept.join('');
}

/** What names are compared by: LEO, Leo, LE0 and LÉO are one name. */
const skeleton = (name: string) =>
  name.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().replace(/0/g, 'O').replace(/[1L]/g, 'I');

// ---- A bar's words, laid out as the core lays them out (yo/core/product/src/line.rs) ----

/** A group's Yos by whom, oldest first; shown newest first. */
type Sender = { name: string; count: number };

/** What a bar tells: a title (its name, a send's words, a notice), one sender's Yos, or a group's senders. */
type Words =
  | { kind: 'title'; text: string }
  | { kind: 'arrival'; count: number; name: string }
  | { kind: 'senders'; senders: Sender[] };

// The app's sizes on a 390-point-wide iPhone: the small size is 24 of the bar's 36 (Metrics.rowSmallFont), a
// bar's words keep 20 points from each edge (BarRow.margin), a title at the bar's size needs 16 more (SteadyText).
const SMALL = 24 / 36;
const MARGIN = 20 / 390;
const SLACK = 16 / 390;

let measurer: CanvasRenderingContext2D | null | undefined;
/** The width of `text` in Montserrat Bold at `px`, with the bars' letter spacing (0.01em). */
function widthOf(text: string, px: number) {
  if (measurer === undefined) measurer = document.createElement('canvas').getContext('2d');
  const spacing = graphemes(text).length * px * 0.01;
  if (!measurer) return text.length * px * 0.7 + spacing;
  measurer.font = `700 ${px}px Montserrat, sans-serif`;
  return measurer.measureText(text).width + spacing;
}

/**
 * The senders (newest first) over two lines (the second may be empty), as line::sender_flow and
 * line::flow_two_lines: the count before each name ("2× Yo from TOM, 3× ANNA," / "4× PETER, LUKAS +2"), whole
 * names only; when the newest does not fit beside "Yo from", that stands alone and the names start on the second
 * line; whatever does not fit ends the second line as " +N".
 */
function flowTwoLines(senders: Sender[], w: (text: string) => number, room: number): [string, string] {
  const prefix = `${yoWords(senders[0]?.count ?? 1)} from `;
  const tokens = senders.map((s, i) => (i > 0 && s.count > 1 ? `${s.count}× ${s.name}` : s.name));
  const n = tokens.length;
  const sep = w(', ');
  const comma = w(',');
  const more = (left: number) => (left === 0 ? 0 : w(` +${left}`));
  let first = prefix;
  let used = w(prefix);
  let placed = 0;
  while (placed < n) {
    const add = (placed === 0 ? 0 : sep) + w(tokens[placed]);
    if (used + add + (placed + 1 < n ? comma : 0) > room) break;
    if (placed > 0) first += ', ';
    first += tokens[placed];
    used += add;
    placed += 1;
  }
  if (placed === 0) first = first.trimEnd();
  else if (placed < n) first += ',';
  let second = '';
  const start = placed;
  used = 0;
  while (placed < n) {
    const add = (placed === start ? 0 : sep) + w(tokens[placed]);
    // The first line holds no name: the second always holds one.
    const forced = start === 0 && placed === 0;
    if (!forced && used + add + more(n - placed - 1) > room) break;
    if (placed > start) second += ', ';
    second += tokens[placed];
    used += add;
    placed += 1;
  }
  if (placed < n) second += second ? ` +${n - placed}` : `+${n - placed}`;
  return [first, second];
}

/** A title over two lines in whole words (line::wrap_two_lines): as many as fit on the first, at least one. */
function wrapTwoLines(text: string, w: (text: string) => number, room: number): [string, string] {
  const words = text.split(' ').filter(Boolean);
  const space = w(' ');
  let used = 0;
  let split = 0;
  while (split < words.length) {
    const add = (split === 0 ? 0 : space) + w(words[split]);
    if (split > 0 && used + add > room) break;
    used += add;
    split += 1;
  }
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')];
}

// ---- A bar ----

type Bar = {
  li: HTMLElement;
  name: string;
  members?: string[];
  text: HTMLElement;
  words: HTMLElement;
  what?: Words; // what it tells now, kept to lay it out again when the phone's width changes
  sent: number; // taps in this run
  shown: number; // the taps the bar says (it moves on at most every 0.2 s)
  sentWords: string; // 'yo' while it says "Sent Yo!", "Sent 📷" or a notice, '' when it says no send
  said: string; // what kind of words the bar says now: 'sent', 'got' or 'name'
  fading: boolean; // the Yos on it are fading out
  sentTimer: number;
  tick: number;
  nextTick: number;
  back: number; // the timer of the Yos back on their way, 0 when none are
  got: number; // Yos on the bar now
  senders: Sender[]; // a group's: who sent them, oldest first
  gotRun: number; // to tell a run's timers from the next one's
  toldAt: number; // when the bar last told of a send or a notice, and when a Yo last came: the newer wins
  arrivalAt: number;
};

// A group's name carries one "#" ("#FAMILY"), whether it brings its own or not (line::bar_title).
const shownName = (name: string, members?: string[]) => (members ? `#${name.replace(/^#/, '')}` : name);

function barElement(name: string, color: number, members?: string[]) {
  const li = document.createElement('li');
  li.dataset.name = name;
  li.dataset.color = String(color);
  if (members) li.dataset.members = members.join(',');
  li.style.setProperty('--c', ROWS[color]);
  li.innerHTML = `<span class="head" role="button" tabindex="0"><span class="words"><span class="text"></span></span></span>`;
  li.querySelector('.text')!.textContent = shownName(name, members);
  return li;
}

/** Some of a group's members Yo back, one after another: two or more of them, some more than once. */
function chorus(members: string[]) {
  const shuffled = [...members].sort(() => Math.random() - 0.5);
  const some = shuffled.slice(0, 2 + Math.floor(Math.random() * (members.length - 1)));
  const from = [...some];
  for (let extra = Math.floor(Math.random() * 5); extra > 0; extra--) from.push(pick(some));
  return from.sort(() => Math.random() - 0.5);
}

export class YoPhone {
  readonly root: HTMLElement;
  private list?: HTMLUListElement;
  private bars = new Map<HTMLElement, Bar>();
  private add?: HTMLElement;
  private input?: HTMLInputElement;
  private hintTimer = 0;
  private push?: HTMLElement;
  private pushTimer = 0;
  private rising: Bar[] = [];
  private lastReply = 0; // when the latest Yo back is due (performance.now() time)
  private visible = false;
  private screen: string;

  constructor(root: HTMLElement) {
    this.root = root;
    this.screen = root.querySelector<HTMLElement>('.scene.on')?.dataset.screen ?? 'list';
    this.list = root.querySelector<HTMLUListElement>('.bars') ?? undefined;
    this.add = root.querySelector<HTMLElement>('.bars .add') ?? undefined;
    this.push = root.querySelector<HTMLElement>('.push') ?? undefined;
    root.querySelectorAll<HTMLElement>('.bars li[data-name]').forEach((li) => this.take(li));

    if ('interactive' in root.dataset) {
      // Whether the visitor is using the keyboard or a pointer: the focus is moved for the keyboard only, so a tap
      // or a click never brings up a focus ring.
      root.addEventListener('pointerdown', () => (this.keyboard = false), true);
      root.addEventListener('keydown', () => (this.keyboard = true), true);
      // A bar is tapped or clicked anywhere on it; its name (a button for the keyboard) takes Enter and Space too.
      const tap = (li: HTMLElement | null) => {
        if (!li || li.classList.contains('ghost')) return;
        if (li === this.add) return this.openAdd();
        this.closeAdd();
        const bar = this.bars.get(li);
        if (bar) this.send(bar, true, this.camera);
      };
      this.list?.addEventListener('click', (e) => tap((e.target as HTMLElement).closest('li')));
      this.list?.addEventListener('keydown', (e) => {
        const head = (e.target as HTMLElement).closest('.head[role="button"]');
        if (!head || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        tap(head.closest('li'));
      });
      this.push?.addEventListener('click', () => this.hideBanner());
      // A glass button clicked from the keyboard (a click with no pointer, detail 0) lights up as a press does, briefly.
      root.querySelectorAll<HTMLElement>('.fab, .zoom').forEach((b) =>
        b.addEventListener('click', (e) => {
          if (e.detail !== 0) return;
          b.classList.add('pressed');
          setTimeout(() => b.classList.remove('pressed'), 150);
        }),
      );
      root.querySelector('.fab.cam')?.addEventListener('click', () => this.setCamera(!this.camera));
      root.querySelector('.fab.menu')?.addEventListener('click', (e) => { e.stopPropagation(); this.setMenu(!root.classList.contains('menu-open')); });
      root.querySelectorAll<HTMLButtonElement>('.pop button').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (b.dataset.do === 'invite') return this.invite(b);
          this.setMenu(false);
          if (b.dataset.do === 'group') this.openSheet();
        }),
      );
      // In the open menu the arrow keys move between its items (Settings, disabled, is passed over).
      root.querySelector('.pop')?.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
        e.preventDefault();
        const items = [...root.querySelectorAll<HTMLButtonElement>('.pop button:not([aria-disabled="true"])')];
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(at + (key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      });
      root.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.pop, .fab.menu')) this.setMenu(false);
      });
      root.querySelector('.scrim')?.addEventListener('click', () => { this.closeSheet(); this.setPicker(false); });
      root.querySelector('.group-sheet .sx')?.addEventListener('click', () => this.closeSheet());
      root.querySelector('.picker .sx')?.addEventListener('click', () => this.setPicker(false));
      root.querySelector('.fab.flip')?.addEventListener('click', () => this.flip());
      root.querySelector('.zoom')?.addEventListener('click', () => this.nextZoom());
      root.querySelector('.fab.lib')?.addEventListener('click', () => this.setPicker(true));
      root.querySelectorAll<HTMLElement>('.grid li').forEach((li) => li.addEventListener('click', () => this.pickPhoto(li.dataset.src!)));
      // While a sheet is open, Tab and Shift+Tab go round its own controls only.
      root.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const open = root.classList.contains('picker-open') ? '.picker' : root.classList.contains('sheet-open') ? '.group-sheet' : '';
        const sheet = open ? root.querySelector<HTMLElement>(open) : null;
        if (!sheet) return;
        const stops = [...sheet.querySelectorAll<HTMLElement>('button:not(:disabled), input')];
        if (!stops.length) return;
        const at = stops.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey ? (at <= 0 ? stops.length - 1 : at - 1) : (at === -1 || at === stops.length - 1 ? 0 : at + 1);
        e.preventDefault();
        stops[next].focus();
      });
      root.querySelector('.screate')?.addEventListener('click', () => this.createGroup());
      root.querySelector('.gname')?.addEventListener('input', () => this.checkSheet());
      root.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (root.classList.contains('picker-open')) this.setPicker(false);
        else if (root.classList.contains('sheet-open')) this.closeSheet();
        else if (root.classList.contains('menu-open')) {
          this.setMenu(false);
          root.querySelector<HTMLElement>('.fab.menu')?.focus();
        }
        else if (this.camera) this.setCamera(false);
      });
    }

    // Every bar's words laid out for the phone's width, again when it changes and once the font is there.
    const refit = () => this.bars.forEach((bar) => this.render(bar, ''));
    refit();
    if (this.list) new ResizeObserver(refit).observe(this.list);
    document.fonts?.ready.then(refit);
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(root);
    if ('autoplay' in root.dataset && !reduced()) this.ambient();
  }

  private take(li: HTMLElement) {
    const bar: Bar = {
      li,
      name: li.dataset.name!,
      members: li.dataset.members?.split(',').filter(Boolean),
      text: li.querySelector('.text')!,
      words: li.querySelector('.words')!,
      sent: 0, shown: 0, sentWords: '', said: 'name', fading: false,
      sentTimer: 0, tick: 0, nextTick: 0, back: 0, got: 0, senders: [], gotRun: 0, toldAt: 0, arrivalAt: 0,
    };
    this.bars.set(li, bar);
    return bar;
  }

  /** The bars as they stand now, top to bottom. */
  private order() {
    return [...(this.list?.querySelectorAll<HTMLElement>(':scope > li[data-name]:not(.ghost)') ?? [])].map((li) => this.bars.get(li)!);
  }

  /** Show one of the phone's screens ('list', 'signup', 'locked', 'code'). */
  show(screen: string) {
    if (screen === this.screen) return;
    this.screen = screen;
    // The hidden screens are inert, so neither the keyboard nor a screen reader reaches into them.
    this.root.querySelectorAll<HTMLElement>('.scene').forEach((s) => {
      s.classList.toggle('on', s.dataset.screen === screen);
      s.inert = s.dataset.screen !== screen;
    });
  }

  // ---- Sending ----

  private sequence = 0;

  private animate(el: HTMLElement, name: string) {
    el.classList.remove('fresh', 'knock');
    void el.offsetWidth;
    el.classList.add(name);
  }

  /** The bar tells of a send or a notice: newer than its Yos, which are no longer shown; its senders start over. */
  private told(bar: Bar) {
    bar.toldAt = ++this.sequence;
    bar.got = 0;
    bar.senders = [];
    bar.fading = false;
    bar.gotRun += 1;
  }

  /**
   * What the bar says now, in its one line: the newest of what you sent ("Sent 2× Yo!") and the Yos that came after
   * it ("Yo from MIA", a group's senders), the name otherwise. A count moving on swaps in place; other words come in
   * fresh (`come`: or knocking).
   */
  private render(bar: Bar, come = 'fresh') {
    const sent = bar.sentWords === 'yo' ? sentWords(bar.shown) : bar.sentWords;
    const yos = bar.got > 0 && bar.arrivalAt > bar.toldAt;
    const said = yos ? 'got' : sent ? 'sent' : 'name';
    let what: Words;
    if (said === 'sent') what = { kind: 'title', text: sent };
    else if (said === 'name') what = { kind: 'title', text: shownName(bar.name, bar.members) };
    else if (!bar.members) what = { kind: 'arrival', count: bar.got, name: bar.name };
    else if (bar.senders.length > 1) what = { kind: 'senders', senders: [...bar.senders].reverse() };
    else what = { kind: 'arrival', count: bar.senders[0]?.count ?? bar.got, name: bar.senders[0]?.name ?? 'Someone' };
    this.lay(bar, what);
    if (said !== bar.said && come) this.animate(bar.words, said === 'got' ? come : 'fresh');
    bar.said = said;
    bar.words.classList.toggle('fading', bar.fading && said === 'got');
  }

  /**
   * The words in the bar's one line (BarText.swift): a title or one sender's Yos at the bar's size if they fit,
   * else at the small size, over two small lines if they must (a title in whole words, Yos with the names whole);
   * a line wider than the room even so (one long word) shrinks. Never "…".
   */
  private lay(bar: Bar, what: Words) {
    bar.what = what;
    const pw = bar.li.clientWidth;
    const big = parseFloat(getComputedStyle(bar.li).fontSize);
    const line = what.kind === 'title' ? what.text : what.kind === 'arrival' ? `${yoWords(what.count)} from ${what.name}` : '';
    const room = pw * (1 - 2 * MARGIN);
    if (!pw || !big || (line && widthOf(line, big) + pw * SLACK <= room)) {
      bar.text.classList.remove('small');
      bar.text.textContent = line || (what.kind === 'senders' ? `Yo from ${what.senders.map((s) => s.name).join(', ')}` : '');
      return;
    }
    const small = big * SMALL;
    const w = (t: string) => widthOf(t, small);
    let lines: string[];
    if (what.kind === 'title') lines = w(line) <= room ? [line] : wrapTwoLines(line, w, room);
    else if (what.kind === 'arrival') lines = flowTwoLines([{ name: what.name, count: what.count }], w, room);
    else lines = flowTwoLines(what.senders, w, room);
    bar.text.classList.add('small');
    bar.text.replaceChildren(
      ...lines.filter(Boolean).map((l) => {
        const span = Object.assign(document.createElement('span'), { className: 'ln', textContent: l });
        const width = w(l);
        if (width > room) span.style.fontSize = `${Math.max(0.5, room / width) * 100}%`;
        return span;
      }),
    );
  }

  private send(bar: Bar, user: boolean, photo = false) {
    if (user) {
      // Sending only clicks; the Yo sound is for Yos that arrive (as in the app).
      playClick();
      navigator.vibrate?.(30);
    }
    this.told(bar);
    if (photo) return this.sendPhoto(bar);
    bar.sent += 1;
    if (bar.sentWords !== 'yo') {
      bar.sentWords = 'yo';
      bar.shown = 1;
      bar.nextTick = performance.now() + 200;
      this.render(bar);
    } else {
      this.render(bar);
      clearTimeout(bar.tick);
      bar.tick = window.setTimeout(() => {
        bar.shown = bar.sent;
        this.render(bar);
        bar.nextTick = performance.now() + 200;
      }, Math.max(0, bar.nextTick - performance.now()));
    }
    clearTimeout(bar.sentTimer);
    bar.sentTimer = window.setTimeout(() => this.sentOver(bar, true), SENT_SECONDS * 1000);
    this.replyLater(bar, 0);
  }

  /**
   * The friend Yos back (a group: several of its members, one after another), `after` ms plus 1.2 to 3 s from now,
   * and at least 0.6 to 1.3 s after the Yos back before them, so replies to several bars arrive one by one. A bar
   * with replies already on their way keeps those: none are added and they are not put off.
   */
  private replyLater(bar: Bar, after: number) {
    if (bar.back) return;
    const now = performance.now();
    const [least, most] = REPLY_SECONDS;
    const due = Math.max(
      now + after + (least + Math.random() * (most - least)) * 1000,
      this.lastReply + (REPLY_GAP_SECONDS + Math.random() * 0.7) * 1000,
    );
    const from = bar.members ? chorus(bar.members) : [undefined];
    this.lastReply = due + (from.length - 1) * BURST_GAP_SECONDS * 1000;
    bar.back = window.setTimeout(() => this.burst(bar, from), due - now);
  }

  /** Yos from these (undefined: the friend), one after another, the bar's replies on their way until the last. */
  private async burst(bar: Bar, from: (string | undefined)[]) {
    bar.back ||= -1;
    for (const [i, member] of from.entries()) {
      if (i) await wait((BURST_GAP_SECONDS * 0.6 + Math.random() * BURST_GAP_SECONDS * 0.8) * 1000);
      this.receive(bar, member);
    }
    bar.back = 0;
  }

  /**
   * Camera mode: the shutter (its flash and its click, only when the photo is taken from the live picture, as the
   * app's Haptic.shutter), the bar says "Sent 📷" with the undo ring for 2 s (sendDelay), then as a send.
   */
  private sendPhoto(bar: Bar) {
    if (!this.picked) playShutter();
    const flash = this.root.querySelector<HTMLElement>('.flash');
    if (flash && !reduced() && !this.picked) {
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');
    }
    this.unpick(); // a picked photo goes once; then the camera again
    bar.sent += 1;
    bar.sentWords = 'Sent 📷';
    this.render(bar);
    const head = bar.li.querySelector('.head')!;
    head.querySelector('.ring')?.remove();
    head.insertAdjacentHTML('afterbegin', '<svg class="ring" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9"/></svg>');
    clearTimeout(bar.sentTimer);
    bar.sentTimer = window.setTimeout(() => {
      head.querySelector('.ring')?.remove();
      bar.sentTimer = window.setTimeout(() => this.sentOver(bar, true), SENT_SECONDS * 1000);
    }, 2000);
    // The photo goes when the ring is over, 2 s from now; the Yo back counts from then.
    this.replyLater(bar, 2000);
  }

  // ---- Camera mode, the menu, Add Group ----

  private camera = false;

  private setCamera(on: boolean) {
    this.camera = on;
    this.closeAdd();
    this.setMenu(false);
    if (on) {
      // the "live pictures", fetched only now
      this.root.querySelectorAll<HTMLImageElement>('.live').forEach((img) => { if (!img.src) img.src = img.dataset.src!; });
    } else {
      this.unpick();
      this.setPicker(false);
    }
    this.root.classList.toggle('camera', on);
    this.root.querySelector('.fab.cam')?.setAttribute('aria-label', on ? 'Close Camera' : 'Camera');
    this.syncControls();
  }

  /** Only the controls that show can be reached: the others are inert, as the hidden screens are. */
  private syncControls() {
    const c = this.root.classList;
    const set = (sel: string, off: boolean) => { const el = this.root.querySelector<HTMLElement>(sel); if (el) el.inert = off; };
    set('.fab.menu', this.camera);
    set('.fab.lib', !this.camera);
    set('.fab.flip', !this.camera);
    set('.zoom', !this.camera || c.contains('front') || c.contains('has-picked'));
  }

  // The back camera's zooms, as the Camera app offers them, each tap the next and round again (CameraZoom); shown as
  // the picture scaled. The front camera has one only, so no button (as the app).
  private zooms = [0.5, 1, 2, 3];
  private zoomAt = 1;

  private setZoom(i: number) {
    this.zoomAt = i;
    const z = this.zooms[i];
    const label = `${z}×`;
    const button = this.root.querySelector<HTMLElement>('.zoom');
    if (button) { button.textContent = label; button.setAttribute('aria-label', `Zoom ${label}`); }
    this.root.querySelector<HTMLElement>('.lens')?.style.setProperty('--zoom', String([1, 1.3, 1.9, 2.6][i]));
  }

  private nextZoom() {
    this.setZoom((this.zoomAt + 1) % this.zooms.length);
  }

  /** Front to back and back again: the picture turns over as it changes, the zoom back at 1×. */
  private flip() {
    const bg = this.root.querySelector<HTMLElement>('.cambg');
    const swap = () => { this.root.classList.toggle('front'); this.setZoom(1); this.syncControls(); };
    if (!bg || reduced()) return swap();
    bg.animate(
      [
        { transform: 'perspective(900px) rotateY(0deg)', filter: 'blur(0)' },
        { transform: 'perspective(900px) rotateY(90deg)', filter: 'blur(6px)', offset: 0.5 },
        { transform: 'perspective(900px) rotateY(0deg)', filter: 'blur(0)' },
      ],
      { duration: 520, easing: 'ease-in-out' },
    );
    setTimeout(swap, 260);
  }

  private keyboard = false;

  // The control that opened the open sheet, where the focus goes back to when the sheet closes.
  private opener?: HTMLElement;

  /** Remember where the focus was as a sheet opens. */
  private keepOpener(fallback?: HTMLElement | null) {
    const active = document.activeElement as HTMLElement | null;
    this.opener = (active && this.root.contains(active) && !active.closest('.pop') ? active : fallback) ?? undefined;
  }

  /** Put the focus back on the sheet's opener, if it can still take it. */
  private backToOpener() {
    const opener = this.opener;
    this.opener = undefined;
    if (this.keyboard && opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
    else if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  private setPicker(open: boolean) {
    const was = this.root.classList.contains('picker-open');
    if (open === was) return;
    if (open) {
      // the grid's pictures, fetched only when the library first opens
      this.root.querySelectorAll<HTMLElement>('.grid li').forEach((li) => { if (!li.style.backgroundImage) li.style.backgroundImage = `url("${li.dataset.src}")`; });
    }
    this.root.classList.toggle('picker-open', open);
    // The library sheet is inert while it is off screen.
    const picker = this.root.querySelector<HTMLElement>('.picker');
    if (picker) picker.inert = !open;
    // Opening moves the focus into the library (its first photo); closing puts it back on what opened it.
    if (open) {
      this.keepOpener(this.root.querySelector<HTMLElement>('.fab.lib'));
      if (this.keyboard) picker?.querySelector<HTMLElement>('.grid button')?.focus({ preventScroll: true });
    } else this.backToOpener();
  }

  private picked?: string;

  /** A photo from the library: it stands in for the live picture and is what the next tap sends. */
  private pickPhoto(src: string) {
    this.picked = src;
    this.root.querySelector<HTMLImageElement>('.picked')!.src = src;
    this.root.querySelector<HTMLImageElement>('.lib .thumb')!.src = src;
    this.root.classList.add('has-picked');
    this.root.querySelector('.camhint')!.textContent = 'Tap a name to send this photo';
    this.syncControls();
    this.setPicker(false);
  }

  private unpick() {
    if (!this.picked) return;
    this.picked = undefined;
    this.root.classList.remove('has-picked');
    this.root.querySelector('.camhint')!.textContent = 'Tap a name · Hold for video';
    this.syncControls();
  }

  private setMenu(open: boolean) {
    this.root.classList.toggle('menu-open', open);
    this.root.querySelector('.fab.menu')?.setAttribute('aria-expanded', String(open));
    // The menu is inert while it is closed; opened with the keyboard, the focus goes to its first item.
    const pop = this.root.querySelector<HTMLElement>('.pop');
    if (pop) pop.inert = !open;
    if (open && this.keyboard) pop?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  /** Invite: the system's share sheet where there is one; else the site's address is copied and the item says so. */
  private async invite(item: HTMLButtonElement) {
    if (navigator.share) {
      this.setMenu(false);
      if (this.keyboard) this.root.querySelector<HTMLElement>('.fab.menu')?.focus({ preventScroll: true });
      try { await navigator.share({ text: 'Yo! justyo.co' }); } catch { /* The visitor closed the share sheet. */ }
      return;
    }
    const label = item.querySelector('span')!;
    try { await navigator.clipboard.writeText('https://justyo.co'); } catch { return this.setMenu(false); }
    label.textContent = 'Copied';
    setTimeout(() => {
      label.textContent = 'Invite';
      if (this.root.classList.contains('menu-open')) {
        const inMenu = this.root.querySelector('.pop')!.contains(document.activeElement);
        this.setMenu(false);
        if (inMenu) this.root.querySelector<HTMLElement>('.fab.menu')?.focus({ preventScroll: true });
      }
    }, 1000);
  }

  private chosen = new Set<string>();

  private openSheet() {
    // Opened from the menu, the focus comes back to the menu's button when the sheet closes.
    this.keepOpener(this.root.querySelector<HTMLElement>('.fab.menu'));
    if (this.camera) this.setCamera(false);
    this.chosen.clear();
    const pickList = this.root.querySelector<HTMLElement>('.pick')!;
    pickList.replaceChildren(
      ...this.order().filter((b) => !b.members).map((b) => {
        const li = document.createElement('li');
        li.style.setProperty('--c', ROWS[Number(b.li.dataset.color)]);
        li.innerHTML = '<button type="button" aria-pressed="false"><span class="dot"></span><span class="nm"></span><span class="ck" aria-hidden="true">✓</span></button>';
        li.querySelector('.nm')!.textContent = b.name;
        const choice = li.querySelector('button')!;
        choice.addEventListener('click', () => {
          if (this.chosen.has(b.name)) this.chosen.delete(b.name);
          else if (this.chosen.size < 19) this.chosen.add(b.name);
          li.classList.toggle('on', this.chosen.has(b.name));
          choice.setAttribute('aria-pressed', String(this.chosen.has(b.name)));
          this.checkSheet();
        });
        return li;
      }),
    );
    const name = this.root.querySelector<HTMLInputElement>('.gname')!;
    name.value = '';
    this.checkSheet();
    this.root.classList.add('sheet-open');
    // The sheet stops being inert as it opens, so its name field can take the focus.
    this.root.querySelector<HTMLElement>('.group-sheet')!.inert = false;
    setTimeout(() => name.focus({ preventScroll: true }), reduced() ? 0 : 350);
  }

  private closeSheet() {
    if (!this.root.classList.contains('sheet-open')) return;
    this.root.classList.remove('sheet-open');
    // The closed sheet is inert again, and the focus goes back to what opened it.
    const sheet = this.root.querySelector<HTMLElement>('.group-sheet');
    if (sheet) sheet.inert = true;
    this.backToOpener();
  }

  /** Create only with a name and at least one friend (as the app's sheet). */
  private checkSheet() {
    const name = this.root.querySelector<HTMLInputElement>('.gname')!;
    // A group's name as the core takes it: at most 32 bytes of UTF-8, cut at a whole character.
    while (new TextEncoder().encode(name.value).length > 32) name.value = graphemes(name.value).slice(0, -1).join('');
    this.root.querySelector<HTMLButtonElement>('.screate')!.disabled = !name.value.trim() || this.chosen.size === 0;
  }

  private createGroup() {
    const name = this.root.querySelector<HTMLInputElement>('.gname')!.value.trim().toUpperCase();
    if (!name || !this.chosen.size) return;
    const members = [...this.chosen].sort();
    this.closeSheet();
    // On top, in the next colour (Friends.takeGroups); a group as the others from now on.
    const li = barElement(name, this.nextColor(), members);
    this.take(li);
    setTimeout(() => {
      this.slideIn(li, [...this.list!.children].filter((el) => !el.classList.contains('ghost')) as HTMLElement[]);
      this.add!.style.setProperty('--c', ROWS[this.nextColor()]);
    }, reduced() ? 0 : 300);
  }

  private sentOver(bar: Bar, thenOnTop: boolean) {
    clearTimeout(bar.tick);
    bar.sent = 0;
    bar.shown = 0;
    bar.nextTick = 0;
    bar.sentWords = '';
    this.render(bar);
    if (thenOnTop) this.rise(bar);
  }

  private get sending() {
    return [...this.bars.values()].some((b) => b.sent > 0);
  }

  // ---- Receiving ----

  /**
   * A Yo arrives (from a group's `member`): the newest on the bar. A new run (none on the bar, or the last one
   * fading) knocks as it comes and starts the senders over; within a run the count moves on in place.
   */
  private receive(bar: Bar, member?: string) {
    if (!bar.li.isConnected) return;
    if (heard()) playYo({ overlap: true, user: false });
    this.banner(member ? `${member} @ ${bar.name}` : bar.name); // as the notification says it (ShareBridge)
    const run = ++bar.gotRun;
    const fresh = bar.got === 0 || bar.fading;
    if (fresh) {
      bar.got = 0;
      bar.senders = [];
      bar.said = '';
    }
    bar.got += 1;
    bar.fading = false;
    if (member) {
      const at = bar.senders.findIndex((s) => s.name === member);
      const sender = at >= 0 ? bar.senders.splice(at, 1)[0] : { name: member, count: 0 };
      sender.count += 1;
      bar.senders.push(sender); // the newest last
    }
    bar.arrivalAt = ++this.sequence;
    this.render(bar, 'knock');
    this.rise(bar);
    this.settle(bar, run);
  }

  /** The Yos stand 3 s, then fade out by 5 s; then the name is back (or a send, if newer). */
  private async settle(bar: Bar, run: number) {
    await wait(YO_SOLID_SECONDS * 1000);
    if (bar.gotRun !== run) return;
    bar.fading = true;
    this.render(bar);
    await wait((YO_SECONDS - YO_SOLID_SECONDS) * 1000);
    if (bar.gotRun !== run) return;
    bar.got = 0;
    bar.senders = [];
    bar.fading = false;
    this.render(bar);
  }

  private banner(from: string) {
    if (!this.push || this.screen !== 'list') return;
    this.push.querySelector('.who')!.textContent = from;
    this.push.classList.add('in');
    clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => this.hideBanner(), 2600);
  }

  private hideBanner() {
    clearTimeout(this.pushTimer);
    this.push?.classList.remove('in');
  }

  private turns = 0;

  /** Now and then a Yo arrives by itself, while the phone is in view and shows the list. */
  private async ambient() {
    await wait(2500 + Math.random() * 2000);
    for (;;) {
      if (this.visible && !document.hidden && this.screen === 'list' && !this.input) {
        // Not the top bar (it would not move): one further down, not busy and with no Yo back on its way.
        // Every third time a group's: several of its members, one after another.
        const calm = this.order().slice(1).filter((b) => !b.sent && !b.got && !b.back);
        const groups = calm.filter((b) => b.members && b.members.length > 1);
        const turn = ++this.turns % 3 === 0 && groups.length;
        const friends = calm.filter((b) => !b.members);
        const bar = turn ? pick(groups) : friends.length ? pick(friends) : calm.length ? pick(calm) : undefined;
        if (bar) this.burst(bar, bar.members ? (turn ? chorus(bar.members) : [pick(bar.members)]) : [undefined]);
      }
      await wait(5000 + Math.random() * 3500);
    }
  }

  // ---- Going on top ----

  /** On top within 0.3 s, all waiting in one step (the newest ends on top); not while a bar is being tapped. */
  private async rise(bar: Bar) {
    this.rising = this.rising.filter((b) => b !== bar);
    this.rising.push(bar);
    if (this.rising.length > 1) return;
    await wait(300);
    while (this.sending) await wait(200);
    const going = this.rising;
    this.rising = [];
    going.forEach((b) => this.toTop(b));
  }

  private toTop(bar: Bar) {
    const list = this.list;
    if (!list || list.firstElementChild === bar.li) return;
    const rows = [...list.children].filter((el) => !el.classList.contains('ghost')) as HTMLElement[];
    const above = rows.slice(0, rows.indexOf(bar.li));
    if (reduced()) {
      list.prepend(bar.li);
      return;
    }
    // Its place fades…
    const ghost = bar.li.cloneNode(true) as HTMLElement;
    ghost.classList.add('ghost');
    // The fading copy is only a picture: out of reach of the keyboard and screen readers.
    ghost.inert = true;
    ghost.style.top = `${bar.li.offsetTop}px`;
    list.append(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' }).finished.then(() => ghost.remove());
    // …the bars above slide down into it, and it comes in from the top.
    this.slideIn(bar.li, above);
  }

  /** Put li on top: the bars that were above it slide down by its height, it comes in from the top. */
  private slideIn(li: HTMLElement, moving: HTMLElement[]) {
    this.list!.prepend(li);
    this.list!.scrollTo({ top: 0 });
    const bar = this.bars.get(li);
    if (bar && !bar.what) this.render(bar, ''); // a new bar's name, laid out now that it has its width
    if (reduced()) return;
    const h = li.offsetHeight;
    const timing = { duration: 350, easing: ease };
    moving.forEach((el) => el.animate([{ transform: `translateY(${-h}px)` }, { transform: 'none' }], timing));
    li.animate([{ transform: 'translateY(-100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], timing);
  }

  // ---- "+": Add Friend ----

  /** The colour the next friend gets: the palette's least used, the first of those (Friends.nextColor). */
  private nextColor() {
    const used = new Map<number, number>();
    this.order().forEach((b) => { const c = Number(b.li.dataset.color); used.set(c, (used.get(c) ?? 0) + 1); });
    let best = 0;
    for (let c = 1; c < ROWS.length; c++) if ((used.get(c) ?? 0) < (used.get(best) ?? 0)) best = c;
    return best;
  }

  private addByKeyboard = false;

  private openAdd() {
    const add = this.add;
    if (!add) return;
    if (this.input) return this.input.focus();
    this.addByKeyboard = this.keyboard;
    add.classList.add('adding');
    const input = document.createElement('input');
    Object.assign(input, { type: 'text', placeholder: 'Name', autocomplete: 'off', spellcheck: false, enterKeyHint: 'done' });
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('aria-label', 'Add a friend by name');
    input.addEventListener('input', () => {
      const clean = canonical(input.value);
      if (clean !== input.value) input.value = clean;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
      if (e.key === 'Escape') { e.preventDefault(); this.closeAdd(); }
    });
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) this.closeAdd(); }, 0));
    // While the field is open the row is no button: the field inside it is what takes the keys.
    const head = add.querySelector<HTMLElement>('.head')!;
    head.removeAttribute('role');
    head.removeAttribute('tabindex');
    head.removeAttribute('aria-label');
    head.replaceChildren(input);
    this.input = input;
    input.focus({ preventScroll: true });
  }

  private closeAdd() {
    const add = this.add;
    if (!add || !this.input) return;
    clearTimeout(this.hintTimer);
    // Back on "+" only when it was opened with the keyboard, so a tap never leaves a focus ring.
    const focused = document.activeElement === this.input && this.addByKeyboard;
    this.input = undefined;
    add.classList.remove('adding');
    // "+" is a button again; the focus stays on it if it was in the field (Enter or Escape).
    const head = add.querySelector<HTMLElement>('.head')!;
    head.innerHTML = '<span class="words"><span class="text">+</span></span>';
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    head.setAttribute('aria-label', 'Add Friend');
    if (focused) head.focus({ preventScroll: true });
  }

  /** What went wrong, in the field for a moment (the app's `say`); the field shakes and stays to type again. */
  private hint(text: string) {
    const input = this.input!;
    input.value = '';
    input.placeholder = text;
    if (!reduced()) {
      this.add!.animate(
        [{ transform: 'none' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }],
        { duration: 380, easing: 'ease-out' },
      );
    }
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => { if (this.input === input) input.placeholder = 'Name'; }, 1500);
  }

  private submit() {
    const name = canonical(this.input?.value ?? '').toUpperCase();
    if (!name) return this.closeAdd();
    if (graphemes(name).length < 3) return this.hint('No Such User');
    const known = this.order().find((b) => !b.members && skeleton(b.name) === skeleton(name));
    this.closeAdd();
    if (known) {
      // Already on the list: its bar says so, as a send does, and stays where it is.
      if (!known.sent) {
        this.told(known);
        known.sentWords = 'Already Added';
        this.render(known);
        clearTimeout(known.sentTimer);
        known.sent = 0;
        known.sentTimer = window.setTimeout(() => this.sentOver(known, false), SENT_SECONDS * 1000);
      }
      known.li.scrollIntoView({ block: 'nearest' });
      return;
    }
    // On top, in the colour "+" had; "+" takes the next one.
    const color = this.nextColor();
    const li = barElement(name, color);
    this.take(li);
    this.slideIn(li, [...this.list!.children].filter((el) => !el.classList.contains('ghost')) as HTMLElement[]);
    this.add!.style.setProperty('--c', ROWS[this.nextColor()]);
  }
}

const phones = new WeakMap<HTMLElement, YoPhone>();

/** Start every YoPhone on the page that has not started yet. */
export function initYoPhones() {
  document.querySelectorAll<HTMLElement>('[data-yo-phone]').forEach((el) => {
    if (!phones.has(el)) phones.set(el, new YoPhone(el));
  });
}

/** The YoPhone of an element (the phone itself or inside it), started if need be. */
export function getYoPhone(el: Element | null): YoPhone | undefined {
  const root = el?.closest<HTMLElement>('[data-yo-phone]') ?? (el as HTMLElement | null)?.querySelector<HTMLElement>('[data-yo-phone]');
  if (!root) return undefined;
  if (!phones.has(root)) phones.set(root, new YoPhone(root));
  return phones.get(root);
}
