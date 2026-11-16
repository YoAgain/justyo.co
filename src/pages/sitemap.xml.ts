// The sitemap at /sitemap.xml (public/robots.txt points to it): every page meant for search engines, by its canonical
// URL (no trailing slash, as the site serves them). Not listed: the redirect stubs, the 404 page and /p/app.
import type { APIRoute } from 'astro';
import { entries, iso } from '../lib/changelog';

const site = 'https://justyo.co';

export const GET: APIRoute = async () => {
  const posts = await entries();
  const pages: { path: string; lastmod?: string }[] = [
    { path: '/' },
    { path: '/p/story' },
    { path: '/p/changelog', lastmod: posts[0] && iso(posts[0].data.date) },
    ...posts.map((e) => ({ path: `/p/changelog/${e.slug}`, lastmod: iso(e.data.date) })),
    { path: '/p/imprint' },
    { path: '/p/privacy' },
  ];
  const urls = pages
    .map(({ path, lastmod }) => `  <url><loc>${site}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
