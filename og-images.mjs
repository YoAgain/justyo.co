// Share images, made at build time: every built page whose og:image points into /og/ gets that picture drawn from
// its og:image:alt ("Yo | <text>"): a big "Yo", a yellow bar, the text, and the page's address underneath, 1200 x 630
// in Amethyst. A new page gets its own picture without anyone drawing it (Head.astro points og:image there).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const fonts = ['700', '900'].map((weight) => ({
  name: 'Montserrat',
  weight: Number(weight),
  style: 'normal',
  data: readFileSync(new URL(`./node_modules/@fontsource/montserrat/files/montserrat-latin-${weight}-normal.woff`, import.meta.url)),
}));

const h = (type, style, children) => ({ type, props: { style, children } });

// The text's size by its length: a word large, a short phrase on two lines, a long title smaller.
const size = (text) => (text.length <= 5 ? 150 : text.length <= 18 ? 124 : 84);

export async function draw(text, address) {
  const svg = await satori(
    h('div', { width: 1200, height: 630, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#9B59B6', color: '#fff', fontFamily: 'Montserrat', position: 'relative' }, [
      h('div', { display: 'flex', alignItems: 'center', gap: 56 }, [
        h('div', { fontSize: 260, fontWeight: 900, lineHeight: 1 }, 'Yo'),
        h('div', { width: 14, height: 210, background: '#F1C40F', borderRadius: 7 }),
        h('div', { fontSize: size(text), fontWeight: 900, lineHeight: 1.02, maxWidth: 600 }, text),
      ]),
      h('div', { position: 'absolute', bottom: 44, fontSize: 34, fontWeight: 700, opacity: 0.85, letterSpacing: 1 }, address),
    ]),
    { width: 1200, height: 630, fonts },
  );
  return new Resvg(svg).render().asPng();
}

const files = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : path.endsWith('.html') ? [path] : [];
});

const meta = (html, key) => html.match(new RegExp(`<meta property="${key}" content="([^"]*)"`))?.[1];
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"');

export default function ogImages() {
  return {
    name: 'og-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const done = new Set();
        for (const file of files(out).sort()) {
          const html = readFileSync(file, 'utf8');
          const image = meta(html, 'og:image');
          const alt = meta(html, 'og:image:alt');
          if (!image?.startsWith('https://justyo.co/og/') || !alt?.startsWith('Yo | ') || done.has(image)) continue;
          done.add(image);
          // The address under the text: the page's own path (the 404 page, the invite at every name, is just the site).
          const route = relative(out, file).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
          const address = route === '404' ? 'justyo.co' : `justyo.co${route ? `/${route}` : ''}`;
          const target = join(out, new URL(image).pathname);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, await draw(unescape(alt.slice(5)), address));
        }
        logger.info(`${done.size} share images`);
      },
    },
  };
}
